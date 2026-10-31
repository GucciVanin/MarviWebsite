using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Coverage;
using Marvi.Domain.Inventory;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Catalog;

/// <summary>
/// MRV-9.5: POST /api/admin/products/with-setup creates the product, its prices per tier and its opening stock per warehouse in one
/// save, audited per row, or nothing at all; each problem is named by field in pt-BR and never repeats the typed value.
/// </summary>
public class ProductWithSetupTests : IClassFixture<MarviApiFactory>
{
    private const string Url = "/api/admin/products/with-setup";
    private readonly MarviApiFactory _factory;

    public ProductWithSetupTests(MarviApiFactory factory) => _factory = factory;

    private sealed record Problem(string Field, string Message);

    private sealed record World(Guid CategoryId, Guid DefaultTierId, Guid WholesaleTierId, Guid WarehouseA, Guid WarehouseB);

    private async Task<World> SeedAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // Exactly one default tier may exist (the class shares one database): reuse it when an earlier test made it.
        var defaultTierId = await db.PricingTiers.Where(t => t.IsDefault).Select(t => t.Id).FirstOrDefaultAsync();
        var world = new World(Guid.NewGuid(), defaultTierId == Guid.Empty ? Guid.NewGuid() : defaultTierId, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        db.Categories.Add(new Category { Id = world.CategoryId, Name = $"Cat {world.CategoryId:N}", IsActive = true });
        if (defaultTierId == Guid.Empty)
        {
            db.PricingTiers.Add(new PricingTier { Id = world.DefaultTierId, Name = "Padrao", IsDefault = true });
        }

        db.PricingTiers.Add(new PricingTier { Id = world.WholesaleTierId, Name = $"Atacado {world.WholesaleTierId:N}" });
        db.Warehouses.Add(new Warehouse { Id = world.WarehouseA, Name = "Armazem A", Address = "Rua A, 1" });
        db.Warehouses.Add(new Warehouse { Id = world.WarehouseB, Name = "Armazem B", Address = "Rua B, 2" });
        await db.SaveChangesAsync();
        return world;
    }

    private static string NewSku() => $"MRV-{Guid.NewGuid():N}"[..20];

    private static CreateProductWithSetupRequest Request(World w, string? sku = null, Action<Builder>? change = null)
    {
        var b = new Builder
        {
            Sku = sku ?? NewSku(), Name = "Cola 2L", CategoryId = w.CategoryId,
            Prices = [new(w.DefaultTierId, 12.5m), new(w.WholesaleTierId, 10m)],
            Stock = [new(w.WarehouseA, 40), new(w.WarehouseB, null)],
        };
        change?.Invoke(b);
        return new CreateProductWithSetupRequest(b.Sku, b.Name, b.Description, b.CategoryId, b.ImageUrl, b.IsActive, b.Attributes, b.Prices, b.Stock);
    }

    private sealed class Builder
    {
        public string? Sku, Name, Description, ImageUrl;
        public Guid? CategoryId;
        public bool IsActive = true;
        public Dictionary<string, string>? Attributes = new();
        public List<ProductSetupPriceRequest>? Prices;
        public List<ProductSetupStockRequest>? Stock;
    }

    private async Task<(int Products, int Prices, int Stock, int Audit)> CountsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return (await db.Products.CountAsync(), await db.ProductPricings.CountAsync(), await db.InventoryRecords.CountAsync(), await db.AuditLogEntries.CountAsync());
    }

    [Fact]
    public async Task Creates_TheProduct_ItsPrices_AndItsStock_AndTheStorefrontShowsThem()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var sku = NewSku();

        var response = await admin.PostAsJsonAsync(Url, Request(w, "  " + sku + "  ", b => { b.Attributes = new() { ["marca"] = "Cola", ["volume"] = "2 L" }; b.Description = " PET "; }));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<ProductAdminDto>())!;
        Assert.Equal(sku, created.Sku);
        Assert.Equal("PET", created.Description);
        Assert.Equal("Cola", created.Attributes["marca"]);
        Assert.EndsWith($"/api/admin/products/{created.Id}", response.Headers.Location!.ToString());

        var prices = (await admin.GetFromJsonAsync<List<ProductPricingDto>>($"/api/admin/products/{created.Id}/pricing"))!;
        Assert.Equal(2, prices.Count);
        Assert.Equal(12.5m, prices.Single(p => p.PricingTierId == w.DefaultTierId).UnitPrice);
        Assert.All(prices, p => Assert.Equal(1, p.MinQty));

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stock = await db.InventoryRecords.Where(i => i.ProductId == created.Id).ToListAsync();
            var record = Assert.Single(stock); // the warehouse with no quantity typed got no record
            Assert.Equal(w.WarehouseA, record.WarehouseId);
            Assert.Equal(40, record.QtyOnHand);
            Assert.Equal(0, record.QtyReserved);
        }

        // The storefront (anonymous: default tier) shows the list price and that the product is in stock.
        var shop = (await _factory.CreateClient().GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!.Single(p => p.Id == created.Id);
        Assert.Equal(12.5m, shop.Price);
        Assert.True(shop.InStock);
    }

    [Fact]
    public async Task Creates_TheProductAlone_WithoutPricesOrStock_AndTheStorefrontSaysOnRequest()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var before = await CountsAsync();

        var response = await admin.PostAsJsonAsync(Url, Request(w, change: b => { b.Prices = null; b.Stock = null; }));
        var created = (await response.Content.ReadFromJsonAsync<ProductAdminDto>())!;

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var after = await CountsAsync();
        Assert.Equal(before.Products + 1, after.Products);
        Assert.Equal(before.Prices, after.Prices);
        Assert.Equal(before.Stock, after.Stock);
        var shop = (await _factory.CreateClient().GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!.Single(p => p.Id == created.Id);
        Assert.Null(shop.Price);
        Assert.False(shop.InStock);
    }

    [Fact]
    public async Task RowsWithoutAPrice_OrWithoutAQuantity_AreSkipped_AndAZeroQuantityIsKept()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();

        var response = await admin.PostAsJsonAsync(Url, Request(w, change: b =>
        {
            b.Prices = [new(w.DefaultTierId, null), new(w.WholesaleTierId, 0.01m)];
            b.Stock = [new(w.WarehouseA, 0), new(w.WarehouseB, 1_000_000)];
        }));
        var created = (await response.Content.ReadFromJsonAsync<ProductAdminDto>())!;

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var price = Assert.Single((await admin.GetFromJsonAsync<List<ProductPricingDto>>($"/api/admin/products/{created.Id}/pricing"))!);
        Assert.Equal(w.WholesaleTierId, price.PricingTierId);
        using var scope = _factory.Services.CreateScope();
        var stock = await scope.ServiceProvider.GetRequiredService<AppDbContext>().InventoryRecords.Where(i => i.ProductId == created.Id).ToListAsync();
        Assert.Equal(2, stock.Count);
        Assert.Equal(0, stock.Single(s => s.WarehouseId == w.WarehouseA).QtyOnHand);
    }

    [Fact]
    public async Task EveryCreatedRow_HasItsOwnAuditEntry()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();

        var created = (await (await admin.PostAsJsonAsync(Url, Request(w))).Content.ReadFromJsonAsync<ProductAdminDto>())!;

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        Assert.Single(entries, e => e.EntityName == "Product" && e.Action == "Create" && e.EntityId == created.Id);
        var priceEntries = entries.Where(e => e.EntityName == "ProductPricing" && e.Action == "Create" && e.Details["data"].Contains(created.Id.ToString())).ToList();
        Assert.Equal(2, priceEntries.Count);
        Assert.Single(entries, e => e.EntityName == "InventoryRecord" && e.Action == "Create" && e.Details["data"].Contains(created.Id.ToString()));
    }

    public static TheoryData<string, string> Invalid() => new()
    {
        { "sku", "ab" }, { "sku", "a b c" }, { "sku", "código-1" }, { "sku", "this-sku-is-way-too-long-because-it-has-41" },
        { "name", "x" }, { "name", "Cola\u0007" }, { "name", "Cola\u202Eevil" },
        { "description", "long" }, { "description", "bell\u0007" },
        { "imageUrl", "http://example.com/a.png" }, { "imageUrl", "javascript:alert(1)" }, { "imageUrl", "https://user:pw@example.com/a.png" },
        { "imageUrl", "https://example.com/a b.png" }, { "imageUrl", "long" }, { "imageUrl", "//example.com/a.png" },
        { "attributes", "31 rows" }, { "attributes", "key 61" }, { "attributes", "value 201" }, { "attributes", "duplicate ignoring case" },
        { "attributes", "blank key" }, { "attributes", "blank value" }, { "attributes", "control" },
        { "prices[0]", "zero" }, { "prices[0]", "negative" }, { "prices[0]", "three decimals" }, { "prices[0]", "too big" },
        { "prices[1]", "same tier twice" },
        { "stock[0]", "negative" }, { "stock[0]", "over a million" }, { "stock[1]", "same warehouse twice" },
        { "categoryId", "missing" }, { "categoryId", "unknown" },
        { "prices[0]", "unknown tier" }, { "stock[0]", "unknown warehouse" },
    };

    [Theory]
    [MemberData(nameof(Invalid))]
    public async Task EachValidationFailure_Is400_NamesItsField_InPortuguese_NeverEchoesTheValue_AndStoresNothing(string field, string case_)
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var typed = "SEGREDO-DIGITADO";
        var rows31 = Enumerable.Range(0, 31).ToDictionary(i => $"k{i}", _ => "v");
        var request = Request(w, change: b =>
        {
            switch ((field, case_))
            {
                case ("sku", "ab"): b.Sku = "ab"; break;
                case ("sku", "a b c"): b.Sku = "a b c"; break;
                case ("sku", "código-1"): b.Sku = "código-1"; break;
                case ("sku", _): b.Sku = new string('a', 41); break;
                case ("name", "x"): b.Name = "x"; break;
                case ("name", "Cola\u0007"): b.Name = typed + "\u0007"; break;
                case ("name", _): b.Name = typed + "\u202E"; break;
                case ("description", "long"): b.Description = new string('d', 2001); break;
                case ("description", _): b.Description = typed + "\u0007"; break;
                case ("imageUrl", "http://example.com/a.png"): b.ImageUrl = "http://example.com/a.png"; break;
                case ("imageUrl", "javascript:alert(1)"): b.ImageUrl = "javascript:alert(1)"; break;
                case ("imageUrl", "https://user:pw@example.com/a.png"): b.ImageUrl = "https://user:pw@example.com/a.png"; break;
                case ("imageUrl", "https://example.com/a b.png"): b.ImageUrl = "https://example.com/a b.png"; break;
                case ("imageUrl", "long"): b.ImageUrl = "https://example.com/" + new string('p', 481); break;
                case ("imageUrl", _): b.ImageUrl = "//example.com/a.png"; break;
                case ("attributes", "31 rows"): b.Attributes = rows31; break;
                case ("attributes", "key 61"): b.Attributes = new() { [new string('k', 61)] = "v" }; break;
                case ("attributes", "value 201"): b.Attributes = new() { ["marca"] = new string('v', 201) }; break;
                case ("attributes", "duplicate ignoring case"): b.Attributes = new() { ["Marca"] = "A", ["marca "] = "B" }; break;
                case ("attributes", "blank key"): b.Attributes = new() { [" "] = "valor" }; break;
                case ("attributes", "blank value"): b.Attributes = new() { ["marca"] = "  " }; break;
                case ("attributes", _): b.Attributes = new() { ["marca"] = typed + "\u0007" }; break;
                case ("prices[0]", "zero"): b.Prices![0] = new(w.DefaultTierId, 0m); break;
                case ("prices[0]", "negative"): b.Prices![0] = new(w.DefaultTierId, -1m); break;
                case ("prices[0]", "three decimals"): b.Prices![0] = new(w.DefaultTierId, 1.234m); break;
                case ("prices[0]", "too big"): b.Prices![0] = new(w.DefaultTierId, 10_000_000_000_000_000m); break;
                case ("prices[0]", _): b.Prices![0] = new(Guid.NewGuid(), 5m); break;
                case ("prices[1]", _): b.Prices![1] = new(w.DefaultTierId, 5m); break;
                case ("stock[0]", "negative"): b.Stock![0] = new(w.WarehouseA, -1); break;
                case ("stock[0]", "over a million"): b.Stock![0] = new(w.WarehouseA, 1_000_001); break;
                case ("stock[0]", _): b.Stock![0] = new(Guid.NewGuid(), 5); break;
                case ("stock[1]", _): b.Stock![1] = new(w.WarehouseA, 5); break;
                case ("categoryId", "missing"): b.CategoryId = null; break;
                case ("categoryId", _): b.CategoryId = Guid.NewGuid(); break;
            }
        });
        var before = await CountsAsync();

        var response = await admin.PostAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        var problems = JsonSerializer.Deserialize<List<Problem>>(body, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Contains(problems, p => p.Field == field);
        Assert.All(problems, p => Assert.False(string.IsNullOrWhiteSpace(p.Message)));
        Assert.DoesNotContain(typed, body); // no value echo
        Assert.Equal(before, await CountsAsync()); // product, prices, stock and audit: nothing was stored
    }

    [Fact]
    public async Task ABadPrice_OnTheSecondRow_StoresNoProduct_NoFirstPrice_AndNoStock()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var request = Request(w, change: b => b.Prices = [new(w.DefaultTierId, 9.99m), new(w.WholesaleTierId, 0m)]);
        var before = await CountsAsync();

        var response = await admin.PostAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(before, await CountsAsync());
        var all = (await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!;
        Assert.DoesNotContain(all, p => p.Sku == request.Sku);
    }

    [Fact]
    public async Task ADuplicateSku_IgnoringCase_Is409_NamesTheSkuField_AndAddsNoPriceOrStock()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var sku = $"Dup-{Guid.NewGuid():N}"[..20];
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync(Url, Request(w, sku))).StatusCode);
        var before = await CountsAsync();

        var duplicate = await admin.PostAsJsonAsync(Url, Request(w, sku.ToUpperInvariant()));

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        var problems = (await duplicate.Content.ReadFromJsonAsync<List<Problem>>(new JsonSerializerOptions(JsonSerializerDefaults.Web)))!;
        Assert.Equal("sku", Assert.Single(problems).Field);
        Assert.Equal("SKU já existe.", problems[0].Message);
        Assert.Equal(before, await CountsAsync());
    }

    [Fact]
    public async Task ADuplicateSku_AgainstAProductMadeTheOldWay_IsRefusedToo()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var sku = $"Old-{Guid.NewGuid():N}"[..20];
        await admin.CreateProductAsync(sku);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync(Url, Request(w, sku.ToLowerInvariant()))).StatusCode);
    }

    [Fact]
    public async Task OnlyAnAdmin_MayUseIt()
    {
        var w = await SeedAsync();
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().PostAsJsonAsync(Url, Request(w))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Url, Request(w))).StatusCode);
    }

    [Fact]
    public async Task AttributesRoundTrip_WithoutLoss_ThroughTheEditEndpoint()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var attributes = new Dictionary<string, string>
        {
            ["Marca"] = "Água de Côco", ["Unidade"] = "garrafa 1,5 L", ["Quantidade por caixa"] = "12", ["Certificação"] = "ISO \"9001\" <b>", ["Peso (kg)"] = "1.5",
        };
        var created = (await (await admin.PostAsJsonAsync(Url, Request(w, change: b => b.Attributes = attributes))).Content.ReadFromJsonAsync<ProductAdminDto>())!;

        var loaded = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{created.Id}"))!;
        Assert.Equal(attributes, loaded.Attributes);

        var put = await admin.PutAsJsonAsync($"/api/admin/products/{created.Id}",
            new UpsertProductRequest(loaded.Sku, loaded.Name, loaded.Description, loaded.CategoryId, loaded.ImageUrl, loaded.IsActive, loaded.Attributes));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
        Assert.Equal(attributes, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{created.Id}"))!.Attributes);
    }

    [Fact]
    public async Task TheOldCreateAndEditEndpoints_ApplyTheSameContentRules_ToImageDescriptionAndAttributes()
    {
        var admin = await _factory.AdminAsync();
        var id = await admin.CreateProductAsync();
        var current = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!;
        UpsertProductRequest With(string? image, Dictionary<string, string>? attributes) =>
            new(current.Sku, current.Name, null, null, image, true, attributes!);

        var httpImage = await admin.PutAsJsonAsync($"/api/admin/products/{id}", With("http://example.com/a.png", new()));
        var duplicateKeys = await admin.PostAsJsonAsync("/api/admin/products", new UpsertProductRequest(NewSku(), "Outro", null, null, null, true, new() { ["A"] = "1", ["a"] = "2" }));
        var ok = await admin.PutAsJsonAsync($"/api/admin/products/{id}", With(" https://example.com/a.png ", new() { [" marca "] = " Cola ", [" "] = " " }));

        Assert.Equal(HttpStatusCode.BadRequest, httpImage.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, duplicateKeys.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        var saved = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!;
        Assert.Equal("https://example.com/a.png", saved.ImageUrl);
        Assert.Equal(new Dictionary<string, string> { ["marca"] = "Cola" }, saved.Attributes);
    }

    [Fact]
    public async Task AFailingSave_StoresNeitherTheProductNorItsRows()
    {
        // The save of the product, its prices, its stock and its audit entries is ONE SaveChanges: a failing audit write stores nothing at all.
        using var factory = new FailingAuditFactory();
        var admin = await factory.AdminAsync();
        Guid category, tier, warehouse;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            category = Guid.NewGuid(); tier = Guid.NewGuid(); warehouse = Guid.NewGuid();
            db.Categories.Add(new Category { Id = category, Name = "Atomic", IsActive = true });
            db.PricingTiers.Add(new PricingTier { Id = tier, Name = "T", IsDefault = true });
            db.Warehouses.Add(new Warehouse { Id = warehouse, Name = "W", Address = "A" });
            await db.SaveChangesAsync();
        }

        factory.FailAuditWrites = true;
        var request = new CreateProductWithSetupRequest("ATOMIC-1", "Atomic", null, category, null, true, null, [new(tier, 5m)], [new(warehouse, 5)]);
        var failure = await Record.ExceptionAsync(async () =>
            Assert.Equal(HttpStatusCode.InternalServerError, (await admin.PostAsJsonAsync(Url, request)).StatusCode));
        factory.FailAuditWrites = false;

        Assert.True(failure is null || failure is InvalidOperationException);
        using var check = factory.Services.CreateScope();
        var checkDb = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await checkDb.Products.Where(p => p.Sku == "ATOMIC-1").ToListAsync());
        Assert.Empty(await checkDb.ProductPricings.ToListAsync());
        Assert.Empty(await checkDb.InventoryRecords.ToListAsync());
    }

    // ---- MRV-9.5 O-5: legacy edit, null rows, caps, description characters, cleaned audit

    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private async Task<Guid> SeedLegacyProductAsync()
    {
        var id = Guid.NewGuid();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var attributes = Enumerable.Range(0, 31).ToDictionary(i => $"k{i}", _ => "v");
        attributes[new string('k', 64)] = "x";
        attributes["Linha"] = "a\nb";
        attributes["Marca"] = "A";
        attributes["marca"] = "B";
        db.Products.Add(new Product { Id = id, Sku = $"OLD-{id:N}"[..20], Name = "Antigo", Description = new string('d', 2500), ImageUrl = "http://exemplo.com/a.png", IsActive = true, Attributes = attributes });
        await db.SaveChangesAsync();
        return id;
    }

    [Fact]
    public async Task AProductWithStoredValuesThatBreakTheNewRules_CanStillBeRenamedAndDeactivated_ButNotChangedToAnotherInvalidValue()
    {
        var admin = await _factory.AdminAsync();
        var id = await SeedLegacyProductAsync();
        var stored = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!;
        UpsertProductRequest Put(string name, bool active, string? description, string? image, Dictionary<string, string> attributes) =>
            new(stored.Sku, name, description, stored.CategoryId, image, active, attributes);

        var unchanged = await admin.PutAsJsonAsync($"/api/admin/products/{id}", Put("Renomeado", false, stored.Description, stored.ImageUrl, stored.Attributes));
        Assert.Equal(HttpStatusCode.NoContent, unchanged.StatusCode);
        var after = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!;
        Assert.Equal("Renomeado", after.Name);
        Assert.False(after.IsActive);
        Assert.Equal(stored.Description, after.Description);
        Assert.Equal(stored.ImageUrl, after.ImageUrl);
        Assert.Equal(stored.Attributes, after.Attributes);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/products/{id}", Put("x2", false, new string('e', 2600), stored.ImageUrl, stored.Attributes))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/products/{id}", Put("x2", false, stored.Description, "http://outro.com/b.png", stored.Attributes))).StatusCode);
        var other = new Dictionary<string, string>(stored.Attributes) { ["extra"] = "y" };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/products/{id}", Put("x2", false, stored.Description, stored.ImageUrl, other))).StatusCode);
        Assert.Equal("Renomeado", (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!.Name);

        var fixedUp = await admin.PutAsJsonAsync($"/api/admin/products/{id}", Put("Corrigido", true, "curta", "https://exemplo.com/a.png", new() { ["Marca"] = "Cola" }));
        Assert.Equal(HttpStatusCode.NoContent, fixedUp.StatusCode);
    }

    [Fact]
    public async Task AProductMadeByTheCsvImport_WithALongDescription_CanBeDeactivatedThroughTheEditEndpoint()
    {
        var admin = await _factory.AdminAsync();
        var sku = $"IMP-{Guid.NewGuid():N}"[..20];
        var csv = $"sku,name,description\n{sku},Importado,{new string('d', 2500)}\n";
        var form = new MultipartFormDataContent { { new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(csv)), "file", "p.csv" } };
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync("/api/admin/products/import", form)).StatusCode);
        var stored = (await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products"))!.Single(p => p.Sku == sku);
        Assert.Equal(2500, stored.Description!.Length);

        var response = await admin.PutAsJsonAsync($"/api/admin/products/{stored.Id}", new UpsertProductRequest(sku, "Importado", stored.Description, null, null, false, stored.Attributes));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False((await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{stored.Id}"))!.IsActive);
    }

    [Fact]
    public async Task NullRows_AnswerFieldProblems_NotAnError()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var body = JsonSerializer.Serialize(new { sku = NewSku(), name = "Cola", categoryId = w.CategoryId, isActive = true, prices = new object?[] { null, new { pricingTierId = w.DefaultTierId, unitPrice = 5 } }, stock = new object?[] { null } });

        var response = await admin.PostAsync(Url, new StringContent(body, System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problems = (await response.Content.ReadFromJsonAsync<List<Problem>>(Web))!;
        Assert.Equal(new[] { "prices[0]", "stock[0]" }, problems.Select(p => p.Field).ToArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync(Url, new StringContent("null", System.Text.Encoding.UTF8, "application/json"))).StatusCode);
    }

    [Fact]
    public async Task MoreThan200PriceRowsOr200StockRows_AreRefused_WithAFieldProblem()
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();
        var many = Enumerable.Range(0, 201).Select(_ => new ProductSetupPriceRequest(Guid.NewGuid(), null)).ToList();
        var manyStock = Enumerable.Range(0, 201).Select(_ => new ProductSetupStockRequest(Guid.NewGuid(), null)).ToList();

        var prices = await admin.PostAsJsonAsync(Url, Request(w, change: b => b.Prices = many));
        var stock = await admin.PostAsJsonAsync(Url, Request(w, change: b => b.Stock = manyStock));

        foreach (var (response, field) in new[] { (prices, "prices"), (stock, "stock") })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains((await response.Content.ReadFromJsonAsync<List<Problem>>(Web))!, p => p.Field == field);
        }
    }

    [Theory]
    [InlineData("zero\u200Bwidth")]
    [InlineData("bidi\u202Eevil")]
    [InlineData("sep\u2028arator")]
    public async Task TheDescription_RefusesInvisibleFormatCharacters_ButAllowsNewlinesAndTabs(string description)
    {
        var admin = await _factory.AdminAsync();
        var w = await SeedAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync(Url, Request(w, change: b => b.Description = description))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync(Url, Request(w, change: b => b.Description = "linha 1\n\tlinha 2\r\nlinha 3"))).StatusCode);
    }

    [Fact]
    public async Task TheEditAudit_RecordsTheCleanedValues_TheRowStores()
    {
        var admin = await _factory.AdminAsync();
        var id = await admin.CreateProductAsync();
        var current = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{id}"))!;

        (await admin.PutAsJsonAsync($"/api/admin/products/{id}", new UpsertProductRequest(current.Sku, "  Limpo  ", "  desc  ", null, null, true, new() { [" marca "] = " Cola ", [" "] = " " }))).EnsureSuccessStatusCode();

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var details = entries.First(e => e.EntityName == "Product" && e.Action == "Update" && e.EntityId == id).Details["data"];
        Assert.Contains("\"Name\":\"Limpo\"", details);
        Assert.Contains("\"Description\":\"desc\"", details);
        Assert.Contains("\"marca\":\"Cola\"", details);
    }
}
