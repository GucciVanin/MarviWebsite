using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Catalog;

/// <summary>
/// MRV-9.8: one path for products. Create (POST with-setup), edit (PUT) and the CSV import all decide through <see cref="ProductRules"/>:
/// the table-driven test sends the same rule cases (the contract file shared with the client) through every entry point and expects the
/// same verdict; the old POST is gone; the import reports failing rows by line, SKU and field; the data check lists stored products that
/// break the rules; an architecture test fails if another product validator appears.
/// </summary>
public class SingleProductPathTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public SingleProductPathTests(MarviApiFactory factory) => _factory = factory;

    private sealed record Problem(string Field, string Message);

    private static string BaseSku() => $"BASE-{Guid.NewGuid():N}"[..20];

    // ---- AC-2: the old create endpoint is gone

    [Fact]
    public async Task TheOldCreateEndpoint_IsGone_ForAnAdmin_AndForAnonymous()
    {
        var admin = await _factory.AdminAsync();
        var body = new { sku = "OLD-CREATE-1", name = "Velho", description = (string?)null, categoryId = (Guid?)null, imageUrl = (string?)null, isActive = true, attributes = new Dictionary<string, string>() };

        var asAdmin = await admin.PostAsJsonAsync("/api/admin/products", body);
        var anonymous = await _factory.CreateClient().PostAsJsonAsync("/api/admin/products", body);

        Assert.Contains(asAdmin.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        Assert.NotEqual(HttpStatusCode.Created, anonymous.StatusCode);
        Assert.DoesNotContain((await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!, p => p.Sku == "OLD-CREATE-1");
    }

    // ---- AC-6: each rule through each of the three entry points gives the same verdict

    private sealed record Seed(Guid TierId, Guid WarehouseId);

    private async Task<Seed> SeedAsync(HttpClient admin)
    {
        var tier = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest($"Tier {Guid.NewGuid():N}"[..20], false));
        tier.EnsureSuccessStatusCode();
        var warehouse = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest($"WH {Guid.NewGuid():N}"[..20], "Rua 1", -23.5, -46.6));
        warehouse.EnsureSuccessStatusCode();
        return new((await tier.Content.ReadFromJsonAsync<PricingTierDto>())!.Id, (await warehouse.Content.ReadFromJsonAsync<WarehouseDto>())!.Id);
    }

    private async Task DeleteBySkuAsync(HttpClient admin, string sku)
    {
        var found = (await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!.SingleOrDefault(p => string.Equals(p.Sku.Trim(), sku.Trim(), StringComparison.OrdinalIgnoreCase));
        if (found is not null)
        {
            (await admin.DeleteAsync($"/api/admin/products/{found.Id}")).EnsureSuccessStatusCode();
        }
    }

    private static string Csv(string cell) => "\"" + cell.Replace("\"", "\"\"") + "\"";

    public static IEnumerable<object[]> Cases() => ProductRuleContract.CaseData();

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task TheSameInput_GivesTheSameVerdict_ThroughTheRules_Create_Update_AndImport(ProductRuleContract.Case rule)
    {
        var admin = await _factory.AdminAsync();
        var seed = await SeedAsync(admin);
        var category = await admin.EnsureTestCategoryAsync();
        var sample = ProductRuleContract.Sample.Of(rule, BaseSku());
        var apiField = ProductRuleContract.Sample.ApiField(rule);

        // 1. The rules themselves.
        var input = ProductRuleContract.ToInput(sample, out var unparsable);
        var problems = new List<ProductProblem>();
        ProductRules.Check(input, problems);
        var byRules = problems.Count == 0 && !unparsable;
        Assert.True(rule.Valid == byRules, $"ProductRules: '{rule.Label}' expected valid={rule.Valid}, got {byRules}.");
        if (!rule.Valid && !unparsable)
        {
            Assert.Contains(problems, p => p.Field == apiField);
        }

        // 2. Create: POST with-setup (a price or quantity goes to the first tier and warehouse).
        if (unparsable)
        {
            Assert.False(rule.Valid); // not a number: the API takes numbers, so the SPA and the import refuse it before this point
        }
        else
        {
            var prices = input.Prices!.Select(p => new ProductSetupPriceRequest(seed.TierId, p.UnitPrice)).ToList();
            var stock = input.Stock!.Select(s => new ProductSetupStockRequest(seed.WarehouseId, s.QtyOnHand)).ToList();
            var created = await admin.PostAsJsonAsync("/api/admin/products/with-setup",
                new CreateProductWithSetupRequest(sample.Sku, sample.Name, sample.Description, sample.WithoutCategory ? null : category, sample.ImageUrl, true, sample.Attributes, prices, stock));
            Assert.True(created.StatusCode is HttpStatusCode.Created or HttpStatusCode.BadRequest, $"create '{rule.Label}': {created.StatusCode}");
            Assert.True(rule.Valid == (created.StatusCode == HttpStatusCode.Created), $"create: '{rule.Label}' expected valid={rule.Valid}, got {created.StatusCode}.");
            if (!rule.Valid)
            {
                Assert.Contains((await created.Content.ReadFromJsonAsync<List<Problem>>())!, p => p.Field == apiField);
            }

            await DeleteBySkuAsync(admin, sample.Sku);
        }

        // 3. Update: PUT of the whole product (prices and stock have their own endpoints, so only the product fields).
        if (rule.Field is not ("price" or "quantity"))
        {
            var baseSku = BaseSku();
            var existing = (await (await admin.PostProductAsync(baseSku)).Content.ReadFromJsonAsync<ProductAdminDto>())!;
            var updated = await admin.PutAsJsonAsync($"/api/admin/products/{existing.Id}",
                new UpdateProductRequest(sample.Sku, sample.Name, sample.Description, sample.WithoutCategory ? null : category, sample.ImageUrl, true, sample.Attributes));
            Assert.True(updated.StatusCode is HttpStatusCode.NoContent or HttpStatusCode.BadRequest, $"update '{rule.Label}': {updated.StatusCode}");
            Assert.True(rule.Valid == (updated.StatusCode == HttpStatusCode.NoContent), $"update: '{rule.Label}' expected valid={rule.Valid}, got {updated.StatusCode}.");
            if (!rule.Valid)
            {
                Assert.Contains((await updated.Content.ReadFromJsonAsync<List<Problem>>())!, p => p.Field == apiField);
            }

            (await admin.DeleteAsync($"/api/admin/products/{existing.Id}")).EnsureSuccessStatusCode();
        }

        // 4. Import: the same product as a CSV row (the file has no image column), checked by a dry run and then really.
        if (rule.Field != "imageUrl")
        {
            var headers = new List<string> { "sku", "name", "description", "category" };
            var cells = new List<string> { Csv(sample.Sku), Csv(sample.Name), Csv(sample.Description ?? string.Empty), Csv(sample.WithoutCategory ? string.Empty : "Test products") };
            foreach (var (key, value) in sample.Attributes)
            {
                headers.Add(Csv("attr_" + key));
                cells.Add(Csv(value));
            }

            if (!string.IsNullOrEmpty(sample.PriceText))
            {
                headers.Add("price");
                cells.Add(Csv(sample.PriceText));
            }

            if (!string.IsNullOrEmpty(sample.QuantityText))
            {
                headers.Add("stock");
                cells.Add(Csv(sample.QuantityText));
            }

            var csv = string.Join(',', headers) + "\n" + string.Join(',', cells) + "\n";
            var query = $"warehouseId={seed.WarehouseId}";
            var dry = await ImportAsync(admin, csv, $"?dryRun=true&{query}");
            var real = await ImportAsync(admin, csv, $"?{query}");
            Assert.True(rule.Valid == (dry.StatusCode == HttpStatusCode.OK), $"import dry run: '{rule.Label}' expected valid={rule.Valid}, got {dry.StatusCode}.");
            Assert.True(rule.Valid == (real.StatusCode == HttpStatusCode.OK), $"import: '{rule.Label}' expected valid={rule.Valid}, got {real.StatusCode}.");
            await DeleteBySkuAsync(admin, sample.Sku);
        }
    }

    private static async Task<HttpResponseMessage> ImportAsync(HttpClient client, string csv, string query = "")
    {
        var form = new MultipartFormDataContent { { new ByteArrayContent(Encoding.UTF8.GetBytes(csv)), "file", "products.csv" } };
        return await client.PostAsync($"/api/admin/products/import{query}", form);
    }

    // ---- AC-3: the import reports failing rows by line, SKU and field, in the dry run and the real import, and saves nothing

    [Fact]
    public async Task AFailingRow_IsReportedWithLineSkuAndField_InTheDryRunAndTheRealImport_AndNothingIsSaved()
    {
        var admin = await _factory.AdminAsync();
        var good = $"GOOD-{Guid.NewGuid():N}"[..20];
        var bad = $"BAD-{Guid.NewGuid():N}"[..20];
        await admin.EnsureTestCategoryAsync();
        var csv = $"sku,name,description,category\n{good},Bom produto,ok,Test products\n{bad},Ruim,\"{new string('x', 2001)}\",Test products\n";

        foreach (var query in new[] { "?dryRun=true", string.Empty })
        {
            var response = await ImportAsync(admin, csv, query);

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var report = (await response.Content.ReadFromJsonAsync<ProductImportReportDto>())!;
            Assert.False(report.Applied);
            var error = Assert.Single(report.Errors);
            Assert.Equal((3, bad, "description"), (error.Line, error.Sku, error.Field));
            Assert.Contains("2000", error.Message);
        }

        var all = (await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!;
        Assert.DoesNotContain(all, p => p.Sku == good || p.Sku == bad); // the file is all or nothing: the good row was not saved either
    }

    [Fact]
    public async Task TheImport_RunsEachRowThroughTheSharedLimits_ThePriceAboveZeroAndTheShortSkuIncluded()
    {
        var admin = await _factory.AdminAsync();
        await admin.EnsureTestCategoryAsync();
        await _factory.RegisterClientAsync(); // the default pricing tier exists
        var csv = "sku,name,price,attr_" + new string('k', 61) + "\nab,Curto,5,x\n";
        var header = await ImportAsync(admin, csv);
        var rows = await ImportAsync(admin, $"sku,name,price,category\nab,Curto,5,Test products\n{BaseSku()},Gratis,0,Test products\n{BaseSku()},{new string('n', 201)},5,Test products\n");

        Assert.Equal(HttpStatusCode.BadRequest, header.StatusCode);
        Assert.Contains("attribute name", (await header.Content.ReadFromJsonAsync<ProductImportReportDto>())!.Errors.Single().Message);
        var errors = (await rows.Content.ReadFromJsonAsync<ProductImportReportDto>())!.Errors;
        Assert.Equal([(2, "sku"), (3, "price"), (4, "name")], errors.Select(e => (e.Line, e.Field!)));
    }

    [Fact]
    public async Task AnAttributeColumn_ReplacesAStoredAttributeIgnoringCase_AndTheMergedResultIsChecked()
    {
        var admin = await _factory.AdminAsync();
        var sku = BaseSku();
        (await admin.PostProductAsync(sku, attributes: new() { ["Marca"] = "Antiga", ["Cor"] = "Azul" })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.OK, (await ImportAsync(admin, $"sku,name,attr_marca\n{sku},Produto,Nova\n")).StatusCode);

        var stored = (await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!.Single(p => p.Sku == sku);
        Assert.Equal(new Dictionary<string, string> { ["Cor"] = "Azul", ["marca"] = "Nova" }, stored.Attributes);

        // 29 stored + 2 new = 31: the product as it would be stored breaks the limit, so the row is refused.
        var many = BaseSku();
        (await admin.PostProductAsync(many, attributes: Enumerable.Range(0, 29).ToDictionary(i => $"k{i}", _ => "v"))).EnsureSuccessStatusCode();
        var refused = await ImportAsync(admin, $"sku,name,attr_a,attr_b\n{many},Produto,1,2\n");
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("attributes", (await refused.Content.ReadFromJsonAsync<ProductImportReportDto>())!.Errors.Single().Field);
    }

    [Fact]
    public async Task ARowForAStoredProductThatBreaksTheRules_IsRefusedUntilTheProductIsFixed()
    {
        var admin = await _factory.AdminAsync();
        var id = await SeedBrokenProductAsync(_factory, $"OLD-{Guid.NewGuid():N}"[..20]);
        var stored = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!;

        var response = await ImportAsync(admin, $"sku,name\n{stored.Sku},Novo nome\n");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var fields = (await response.Content.ReadFromJsonAsync<ProductImportReportDto>())!.Errors.Select(e => e.Field).ToHashSet();
        Assert.Superset(new HashSet<string?> { "description", "imageUrl" }, fields);
        Assert.Equal("Antigo", (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!.Name);
    }

    internal static async Task<Guid> SeedBrokenProductAsync(MarviApiFactory factory, string sku)
    {
        var id = Guid.NewGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Products.Add(new Product { Id = id, Sku = sku, Name = "Antigo", Description = new string('d', 2500), ImageUrl = "http://exemplo.com/a.png", IsActive = true, Attributes = new() { ["k"] = "v" } });
        await db.SaveChangesAsync();
        return id;
    }

    // ---- AC-4: the data check

    [Fact]
    public async Task TheDataCheck_ListsStoredProductsThatBreakTheRules_WithoutChangingThem()
    {
        var admin = await _factory.AdminAsync();
        var cat = await admin.EnsureTestCategoryAsync();
        var rows = new Dictionary<string, Product>
        {
            ["fine"] = new() { Id = Guid.NewGuid(), CategoryId = cat, Sku = "CHK-FINE-1", Name = "Certo", Description = "ok", ImageUrl = "https://exemplo.com/a.png", Attributes = new() { ["Marca"] = "A" } },
            ["sku"] = new() { Id = Guid.NewGuid(), CategoryId = cat, Sku = new string('S', 50), Name = "Sku longo", Attributes = new() },
            ["shape"] = new() { Id = Guid.NewGuid(), CategoryId = cat, Sku = "CHK SHAPE", Name = "Sku com espaco", Attributes = new() },
            ["description"] = new() { Id = Guid.NewGuid(), CategoryId = cat, Sku = "CHK-DESC-1", Name = "Descricao", Description = new string('d', 2500), Attributes = new() },
            ["image"] = new() { Id = Guid.NewGuid(), CategoryId = cat, Sku = "CHK-IMG-1", Name = "Imagem", ImageUrl = "http://exemplo.com/a.png", Attributes = new() },
            ["attributes"] = new() { Id = Guid.NewGuid(), CategoryId = cat, Sku = "CHK-ATT-1", Name = "Atributos", Attributes = Enumerable.Range(0, 31).ToDictionary(i => $"k{i}", _ => "v") },
            ["nocat"] = new() { Id = Guid.NewGuid(), Sku = "CHK-NOCAT-1", Name = "Sem categoria", Attributes = new() },
            ["many"] = new() { Id = Guid.NewGuid(), CategoryId = cat, Sku = "CHK-MANY-1", Name = "Varios", Description = new string('d', 2500), ImageUrl = "http://exemplo.com/b.png", Attributes = new() { ["A"] = "1", ["a"] = "2" } },
        };
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Products.AddRange(rows.Values);
            await db.SaveChangesAsync();
        }

        var before = await admin.GetStringAsync("/api/admin/products");
        var response = await admin.GetAsync("/api/admin/products/data-check");
        var after = await admin.GetStringAsync("/api/admin/products");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var check = (await response.Content.ReadFromJsonAsync<ProductDataCheckDto>())!;
        Assert.True(check.Checked >= rows.Count);
        Assert.Equal(check.Broken, check.Products.Count);
        string[] FieldsOf(string key) => check.Products.Single(p => p.Id == rows[key].Id).Problems.Select(p => p.Field).Distinct().Order().ToArray();
        Assert.DoesNotContain(check.Products, p => p.Id == rows["fine"].Id);
        Assert.Equal(["categoryId"], FieldsOf("nocat"));
        Assert.Equal(["sku"], FieldsOf("sku"));
        Assert.Equal(["sku"], FieldsOf("shape"));
        Assert.Equal(["description"], FieldsOf("description"));
        Assert.Equal(["imageUrl"], FieldsOf("image"));
        Assert.Equal(["attributes"], FieldsOf("attributes"));
        Assert.Equal(["attributes", "description", "imageUrl"], FieldsOf("many"));
        Assert.Equal(rows["sku"].Sku, check.Products.Single(p => p.Id == rows["sku"].Id).Sku);
        Assert.Equal(before, after); // read-only: nothing was rewritten
    }

    // ---- AC-1: one validator

    [Fact]
    public void ThereIsOneProductValidator_AndTheProductEntryPointsOnlyCallIt()
    {
        // 1. No second validator type: in the domain and the API, the only class that names product rules or validation is ProductRules.
        var types = typeof(ProductRules).Assembly.GetTypes().Concat(typeof(Program).Assembly.GetTypes());
        var validators = types
            .Where(t => Regex.IsMatch(t.Name, "Product.*(Rules|Validator|Validation|Checker)$") || Regex.IsMatch(t.Name, "^(Validate|Check).*Product"))
            .Select(t => t.Name).Distinct().Order().ToArray();
        Assert.Equal(["ProductRules"], validators);

        // 2. The entry points decide through it and carry no limit of their own.
        var root = Path.GetDirectoryName(ProductRuleContract.FilePath())!;
        while (!File.Exists(Path.Combine(root, "Marvi.slnx")))
        {
            root = Path.GetDirectoryName(root)!;
        }

        string Source(string relative) => File.ReadAllText(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        var products = Source("src/Marvi.Api/Features/Catalog/AdminProductsController.cs");
        var import = Source("src/Marvi.Api/Features/Catalog/AdminProductImportController.cs");
        var planner = Source("src/Marvi.Domain/Catalog/ProductImportPlanner.cs");

        Assert.Equal(3, Regex.Matches(products, @"ProductRules\.Check\(").Count); // create (with-setup), update and the data check
        Assert.Contains("ProductImportPlanner.Plan(", import);
        Assert.Contains("ProductRules.Check(", planner);
        Assert.Contains("ProductRules.Check(", products);

        // A limit compared in a product entry point (sku.Length > 40, ExceedsLength, a regex, a Max/Min constant of its own) is a second rule.
        var ownRule = new Regex(@"ExceedsLength\(|AdminInput\.IsBlank|\bnew Regex\(|\[GeneratedRegex|Length\s*(>=|<=|>|<)\s*(\d{2,}|Max\w+|Min\w+)|\bconst\s+int\s+(Max|Min)\w+");
        foreach (var (name, text) in new[] { ("AdminProductsController", products), ("AdminProductImportController", import), ("ProductImportPlanner", planner) })
        {
            var hit = ownRule.Match(text.Replace("MaxRows", "").Replace("MaxFileBytes", ""));
            Assert.True(!hit.Success, $"{name} decides a product limit itself ('{hit.Value}'): it belongs in ProductRules.");
        }

        // 3. The old names are gone.
        Assert.DoesNotContain("ProductSetupRules", products + import + planner);
        Assert.DoesNotContain("UpsertProductRequest", products);
    }

    [Fact]
    public void TheProductRulesLimits_AreTheOnesInTheContractFileTheClientReads()
    {
        var limits = ProductRuleContract.Limits();
        var constants = typeof(ProductRules).GetFields(BindingFlags.Public | BindingFlags.Static).Where(f => f.IsLiteral && f.FieldType == typeof(int))
            .ToDictionary(f => f.Name, f => (int)f.GetRawConstantValue()!);

        Assert.Equal(constants["MinSkuLength"], limits["skuMin"]);
        Assert.Equal(constants["MaxSkuLength"], limits["skuMax"]);
        Assert.Equal(constants["MinNameLength"], limits["nameMin"]);
        Assert.Equal(constants["MaxNameLength"], limits["nameMax"]);
        Assert.Equal(constants["MaxDescriptionLength"], limits["description"]);
        Assert.Equal(constants["MaxImageUrlLength"], limits["imageUrl"]);
        Assert.Equal(constants["MaxAttributes"], limits["attributes"]);
        Assert.Equal(constants["MaxAttributeKeyLength"], limits["attributeKey"]);
        Assert.Equal(constants["MaxAttributeValueLength"], limits["attributeValue"]);
        Assert.Equal(constants["MaxStock"], limits["stock"]);
        Assert.Equal(10, limits.Count); // a new limit in the file must be compared here too
    }
}
