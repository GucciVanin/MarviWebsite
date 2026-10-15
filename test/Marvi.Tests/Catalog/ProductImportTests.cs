using System.Net;
using System.Net.Http.Json;
using System.Text;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Catalog;

/// <summary>MRV-2.1: an admin imports products from a CSV file through the real HTTP pipeline.</summary>
public class ProductImportTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public ProductImportTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..20];

    private static async Task<HttpResponseMessage> ImportAsync(HttpClient client, string csv, string query = "")
    {
        var form = new MultipartFormDataContent { { new ByteArrayContent(Encoding.UTF8.GetBytes(csv)), "file", "products.csv" } };
        return await client.PostAsync($"/api/admin/products/import{query}", form);
    }

    private static async Task<ProductImportReportDto> ReportAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ProductImportReportDto>())!;

    private static async Task<CategoryAdminDto> CreateCategoryAsync(HttpClient admin, string name)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(name, 1, true));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CategoryAdminDto>())!;
    }

    private static async Task<Guid> CreateWarehouseAsync(HttpClient admin)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(Unique("WH"), "1 Main St", -23.5, -46.6));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WarehouseDto>())!.Id;
    }

    private static async Task<ProductAdminDto?> FindProductAsync(HttpClient admin, string sku) =>
        (await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!.SingleOrDefault(p => string.Equals(p.Sku, sku, StringComparison.OrdinalIgnoreCase));

    [Fact]
    public async Task Import_CreatesProducts_WithCategoryPricesStockAndAttributes()
    {
        var admin = await _factory.AdminAsync();
        await _factory.RegisterClientAsync(); // makes sure the default pricing tier exists
        var category = await CreateCategoryAsync(admin, Unique("Cervejas"));
        var warehouse = await CreateWarehouseAsync(admin);
        var gold = (await (await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(Unique("Gold"), false))).Content.ReadFromJsonAsync<PricingTierDto>())!;
        var sku = Unique("BEER");

        var response = await ImportAsync(admin,
            $"sku,name,description,category,price,stock,attr_Marca,tier_{gold.Name}\n{sku},Lager 600ml,Cold,{category.Name.ToUpperInvariant()},\"12,50\",40,Acme,\"10,00\"\n",
            $"?warehouseId={warehouse}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var report = await ReportAsync(response);
        Assert.True(report.Applied);
        Assert.Equal((1, 1, 0), (report.Rows, report.Created, report.Updated));
        var product = (await FindProductAsync(admin, sku))!;
        Assert.Equal("Lager 600ml", product.Name);
        Assert.Equal("Cold", product.Description);
        Assert.Equal(category.Id, product.CategoryId);
        Assert.True(product.IsActive);
        Assert.Equal("Acme", product.Attributes["Marca"]);
        var prices = (await admin.GetFromJsonAsync<List<ProductPricingDto>>($"/api/admin/products/{product.Id}/pricing"))!;
        Assert.Equal(12.5m, Assert.Single(prices, p => p.PricingTierName != gold.Name).UnitPrice);
        Assert.Equal(10m, Assert.Single(prices, p => p.PricingTierName == gold.Name).UnitPrice);
        Assert.All(prices, p => Assert.Equal(1, p.MinQty));
        var stock = (await admin.GetFromJsonAsync<List<InventoryRecordDto>>($"/api/employee/inventory?warehouseId={warehouse}"))!;
        Assert.Equal(40, Assert.Single(stock, s => s.ProductId == product.Id).QtyOnHand);
        var listed = (await _factory.CreateClient().GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!;
        Assert.Equal(12.5m, Assert.Single(listed, p => p.Id == product.Id).Price);
    }

    [Fact]
    public async Task Importing_TheSameFileTwice_ChangesNothingTheSecondTime()
    {
        var admin = await _factory.AdminAsync();
        var sku = Unique("TWICE");
        var csv = $"sku,name,description\n{sku},Alpha,First\n";

        var first = await ReportAsync(await ImportAsync(admin, csv));
        var second = await ReportAsync(await ImportAsync(admin, csv));

        Assert.Equal((1, 0), (first.Created, first.Updated));
        Assert.Equal((0, 1), (second.Created, second.Updated));
        Assert.Single((await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!, p => p.Sku == sku);
    }

    [Fact]
    public async Task Reimporting_UpdatesBySku_IgnoringCase_AndBlankCellsLeaveExistingValuesAlone()
    {
        var admin = await _factory.AdminAsync();
        var category = await CreateCategoryAsync(admin, Unique("Aguas"));
        var sku = Unique("keep");
        await ImportAsync(admin, $"sku,name,description,category,attr_Marca\n{sku},Water,Still,{category.Name},Acme\n");
        var original = (await FindProductAsync(admin, sku))!;
        // Deactivate through the admin API: an import must not reactivate it.
        (await admin.PutAsJsonAsync($"/api/admin/products/{original.Id}",
            new UpsertProductRequest(sku, original.Name, original.Description, original.CategoryId, null, false, original.Attributes))).EnsureSuccessStatusCode();

        var report = await ReportAsync(await ImportAsync(admin, $"sku,name,description,category,attr_Marca,attr_Cor\n{sku.ToUpperInvariant()},Sparkling Water,,,,Blue\n"));

        Assert.Equal((0, 1), (report.Created, report.Updated));
        var updated = (await FindProductAsync(admin, sku))!;
        Assert.Equal(original.Id, updated.Id);
        Assert.Equal("Sparkling Water", updated.Name);
        Assert.Equal("Still", updated.Description);
        Assert.Equal(category.Id, updated.CategoryId);
        Assert.False(updated.IsActive);
        Assert.Equal("Acme", updated.Attributes["Marca"]);
        Assert.Equal("Blue", updated.Attributes["Cor"]);
    }

    [Fact]
    public async Task AFileWithAnyError_ImportsNothing_AndReportsEveryProblemWithItsLine()
    {
        var admin = await _factory.AdminAsync();
        var good = Unique("GOOD");

        var response = await ImportAsync(admin, $"sku,name,price\n{good},Fine,5\n{Unique("BAD")},,abc\n");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var report = await ReportAsync(response);
        Assert.False(report.Applied);
        Assert.Equal([3, 3], report.Errors.Select(e => e.Line));
        Assert.Null(await FindProductAsync(admin, good));
    }

    [Fact]
    public async Task ADryRun_ReportsWhatWouldHappen_WithoutChangingAnything()
    {
        var admin = await _factory.AdminAsync();
        var existing = Unique("OLD");
        var fresh = Unique("NEW");
        await ImportAsync(admin, $"sku,name\n{existing},Old\n");

        var response = await ImportAsync(admin, $"sku,name\n{existing},Renamed\n{fresh},Brand new\n", "?dryRun=true");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var report = await ReportAsync(response);
        Assert.True(report.DryRun);
        Assert.False(report.Applied);
        Assert.Equal((2, 1, 1), (report.Rows, report.Created, report.Updated));
        Assert.Equal("Old", (await FindProductAsync(admin, existing))!.Name);
        Assert.Null(await FindProductAsync(admin, fresh));
    }

    [Fact]
    public async Task TheImport_IsAudited()
    {
        var admin = await _factory.AdminAsync();
        await ImportAsync(admin, $"sku,name\n{Unique("AUD")},Audited\n");

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;

        var entry = entries.First(e => e.Action == "Import");
        Assert.Equal("Product", entry.EntityName);
        Assert.Contains("\"Created\":1", entry.Details["data"]);
    }

    [Fact]
    public async Task Stock_NeedsAWarehouse_AndAnUnknownWarehouseIsRefused()
    {
        await using var factory = new MarviApiFactory(); // a pristine database: no warehouse yet
        var admin = await factory.AdminAsync();
        var csv = $"sku,name,stock\n{Unique("STK")},Stocked,5\n";

        var none = await ImportAsync(admin, csv);
        var unknown = await ImportAsync(admin, csv, $"?warehouseId={Guid.NewGuid()}");
        var onlyOne = await CreateWarehouseAsync(admin);
        var implied = await ImportAsync(admin, csv); // exactly one warehouse: it is the one
        await CreateWarehouseAsync(admin);
        var ambiguous = await ImportAsync(admin, $"sku,name,stock\n{Unique("STK")},Stocked,5\n");

        Assert.Equal(HttpStatusCode.BadRequest, none.StatusCode);
        Assert.Contains("stock needs a warehouse", (await ReportAsync(none)).Errors.Single().Message);
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.OK, implied.StatusCode);
        Assert.Equal(5, (await admin.GetFromJsonAsync<List<InventoryRecordDto>>($"/api/employee/inventory?warehouseId={onlyOne}"))!.Single().QtyOnHand);
        Assert.Equal(HttpStatusCode.BadRequest, ambiguous.StatusCode);
    }

    [Fact]
    public async Task ARequestWithoutAFile_IsRefused()
    {
        var admin = await _factory.AdminAsync();

        var response = await admin.PostAsync("/api/admin/products/import", new MultipartFormDataContent());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Import_IsForAdminsOnly()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await ImportAsync(client, "sku,name\nA,B\n")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ImportAsync(_factory.CreateClient(), "sku,name\nA,B\n")).StatusCode);
    }
}
