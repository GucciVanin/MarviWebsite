using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Tests.Support;

namespace Marvi.Tests.Support;

/// <summary>
/// The admin input rules (MRV-4.6) exactly as they work today: trimming, required and maximum lengths, duplicates
/// ignoring case, and delete protection. Entities that have no limit today (deals, tiers, warehouses) are pinned too,
/// so consolidating the rules cannot start rejecting what is accepted now.
/// </summary>
public class AdminInputPolicyTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public AdminInputPolicyTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}";

    private static UpsertProductRequest Product(string sku, string name, Guid? categoryId = null) =>
        new(sku, name, null, categoryId, null, true, new());

    private static async Task<string> BodyAsync(HttpResponseMessage response) => await response.Content.ReadAsStringAsync();

    // ---- products

    [Fact]
    public async Task Products_AreTrimmed_AndRequireSkuAndName()
    {
        var admin = await _factory.AdminAsync();
        var sku = Unique("SKU");

        var created = await admin.PostAsJsonAsync("/api/admin/products", Product($"  {sku}  ", "  Widget  "));
        var dto = (await created.Content.ReadFromJsonAsync<ProductAdminDto>())!;

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(sku, dto.Sku);
        Assert.Equal("Widget", dto.Name);

        var blank = await admin.PostAsJsonAsync("/api/admin/products", Product("  ", "Widget"));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        Assert.Equal("SKU and name are required.", await BodyAsync(blank));
    }

    [Fact]
    public async Task Products_LimitSkuTo64_AndNameTo200_AfterTrimming()
    {
        var admin = await _factory.AdminAsync();

        var atLimit = await admin.PostAsJsonAsync("/api/admin/products", Product(new string('s', 64), new string('n', 200)));
        var skuTooLong = await admin.PostAsJsonAsync("/api/admin/products", Product(new string('t', 65), "Widget"));
        var nameTooLong = await admin.PostAsJsonAsync("/api/admin/products", Product(Unique("SKU"), new string('n', 201)));
        var paddedStillFits = await admin.PostAsJsonAsync("/api/admin/products", Product("  " + new string('u', 64) + "  ", "Widget"));

        Assert.Equal(HttpStatusCode.Created, atLimit.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, skuTooLong.StatusCode);
        Assert.Equal("SKU is limited to 64 characters and name to 200.", await BodyAsync(skuTooLong));
        Assert.Equal(HttpStatusCode.BadRequest, nameTooLong.StatusCode);
        Assert.Equal(HttpStatusCode.Created, paddedStillFits.StatusCode);
    }

    [Fact]
    public async Task Products_RefuseADuplicateSku_IgnoringCase_ButNotForTheSameProduct()
    {
        var admin = await _factory.AdminAsync();
        var sku = Unique("sku");
        var id = (await (await admin.PostAsJsonAsync("/api/admin/products", Product(sku, "A"))).Content.ReadFromJsonAsync<ProductAdminDto>())!.Id;

        var duplicate = await admin.PostAsJsonAsync("/api/admin/products", Product(sku.ToUpperInvariant(), "B"));
        var selfUpdate = await admin.PutAsJsonAsync($"/api/admin/products/{id}", Product(sku.ToUpperInvariant(), "A2"));

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("A product with this SKU already exists.", await BodyAsync(duplicate));
        Assert.Equal(HttpStatusCode.NoContent, selfUpdate.StatusCode);
    }

    // ---- categories

    [Fact]
    public async Task Categories_AreTrimmed_RequiredAndLimitedTo200_AndUniqueIgnoringCase()
    {
        var admin = await _factory.AdminAsync();
        var name = Unique("Bebidas");

        var created = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest($"  {name}  ", 1, true));
        var dto = (await created.Content.ReadFromJsonAsync<CategoryAdminDto>())!;
        var duplicate = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(name.ToUpperInvariant(), 1, true));
        var blank = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest("   ", 1, true));
        var atLimit = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(new string('c', 200), 1, true));
        var tooLong = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(new string('d', 201), 1, true));

        Assert.Equal(name, dto.Name);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("A category with this name already exists.", await BodyAsync(duplicate));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        Assert.Equal("Name is required.", await BodyAsync(blank));
        Assert.Equal(HttpStatusCode.Created, atLimit.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal("Name must be at most 200 characters.", await BodyAsync(tooLong));
    }

    // ---- entities with no limit today (must stay that way until the owner decides)

    [Fact]
    public async Task Warehouses_AreTrimmedAndRequireNameAndAddress_ButHaveNoLengthLimit()
    {
        var admin = await _factory.AdminAsync();
        var name = Unique("CD");

        var created = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest($"  {name}  ", "  Rua A, 1  ", -23.5, -46.6));
        var dto = (await created.Content.ReadFromJsonAsync<WarehouseDto>())!;
        var blank = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest("CD", "  ", -23.5, -46.6));
        var long500 = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(new string('w', 500), new string('a', 500), -23.5, -46.6));

        Assert.Equal((name, "Rua A, 1"), (dto.Name, dto.Address));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        Assert.Equal("Name and address are required.", await BodyAsync(blank));
        Assert.Equal(HttpStatusCode.Created, long500.StatusCode);
    }

    [Fact]
    public async Task PricingTiers_AreTrimmedAndRequireAName_ButHaveNoLengthLimit()
    {
        var admin = await _factory.AdminAsync();
        var name = Unique("Tier");

        var created = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest($"  {name}  ", false));
        var dto = (await created.Content.ReadFromJsonAsync<PricingTierDto>())!;
        var blank = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(" ", false));
        var long500 = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(new string('t', 500), false));

        Assert.Equal(name, dto.Name);
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        Assert.Equal("Name is required.", await BodyAsync(blank));
        Assert.Equal(HttpStatusCode.Created, long500.StatusCode);
    }

    [Fact]
    public async Task Deals_RequireAName_ButKeepItUntrimmedAndUnlimited()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var now = DateTime.UtcNow;
        UpsertDealRequest Deal(string name) => new(name, DiscountType.Percent, 10m, now.AddDays(-1), now.AddDays(1), [productId], [], 1);

        var padded = await admin.PostAsJsonAsync("/api/admin/deals", Deal("  Padded deal  "));
        var long500 = await admin.PostAsJsonAsync("/api/admin/deals", Deal(new string('d', 500)));
        var blank = await admin.PostAsJsonAsync("/api/admin/deals", Deal(" "));

        Assert.Equal(HttpStatusCode.Created, padded.StatusCode);
        Assert.Equal("  Padded deal  ", (await padded.Content.ReadFromJsonAsync<DealAdminDto>())!.Name);
        Assert.Equal(HttpStatusCode.Created, long500.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
    }

    [Fact]
    public async Task Employees_LimitTheEmployeeCodeTo50()
    {
        var admin = await _factory.AdminAsync();
        CreateEmployeeRequest Employee(string code) => new($"{Guid.NewGuid()}@example.com", "Test1234!", code, null, DateTime.UtcNow);

        var tooLong = await admin.PostAsJsonAsync("/api/admin/employees", Employee(new string('e', 51)));
        var atLimit = await admin.PostAsJsonAsync("/api/admin/employees", Employee(new string('f', 50)));

        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.Created, atLimit.StatusCode);
    }

    // ---- delete protection: history and references are never erased

    [Fact]
    public async Task ProductsOnQuotes_CannotBeDeleted()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var productId = await admin.CreateProductAsync();
        (await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]))).EnsureSuccessStatusCode();

        var response = await admin.DeleteAsync($"/api/admin/products/{productId}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("The product appears on quotes or orders and cannot be deleted. Deactivate it instead.", await BodyAsync(response));
    }

    [Fact]
    public async Task Categories_InUseByProductsOrDeals_CannotBeDeleted()
    {
        var admin = await _factory.AdminAsync();
        var withProduct = (await (await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(Unique("A"), 1, true))).Content.ReadFromJsonAsync<CategoryAdminDto>())!.Id;
        await admin.PostAsJsonAsync("/api/admin/products", Product(Unique("SKU"), "In category", withProduct));
        var withDeal = (await (await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(Unique("B"), 1, true))).Content.ReadFromJsonAsync<CategoryAdminDto>())!.Id;
        var now = DateTime.UtcNow;
        (await admin.PostAsJsonAsync("/api/admin/deals", new UpsertDealRequest(Unique("Deal"), DiscountType.Percent, 5m, now.AddDays(-1), now.AddDays(1), [], [withDeal], 1))).EnsureSuccessStatusCode();

        var byProduct = await admin.DeleteAsync($"/api/admin/categories/{withProduct}");
        var byDeal = await admin.DeleteAsync($"/api/admin/categories/{withDeal}");

        Assert.Equal(HttpStatusCode.Conflict, byProduct.StatusCode);
        Assert.Equal("The category still has products. Move them or deactivate the category instead.", await BodyAsync(byProduct));
        Assert.Equal(HttpStatusCode.Conflict, byDeal.StatusCode);
        Assert.Equal("A deal still targets this category. Update the deal or deactivate the category instead.", await BodyAsync(byDeal));
    }

    [Fact]
    public async Task Warehouses_WithStock_CannotBeDeleted()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var warehouse = (await (await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(Unique("CD"), "Rua A, 1", -23.5, -46.6))).Content.ReadFromJsonAsync<WarehouseDto>())!;
        (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(productId, warehouse.Id, 5, 1))).EnsureSuccessStatusCode();

        var response = await admin.DeleteAsync($"/api/admin/warehouses/{warehouse.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("The warehouse still has inventory or orders. Clear its stock first; warehouses with order history cannot be deleted.", await BodyAsync(response));
    }
}
