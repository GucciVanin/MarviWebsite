using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Tests.Support;

namespace Marvi.Tests.Catalog;

/// <summary>
/// Found by running the stack against realistic data: deleting a product silently deleted its order lines (orders no
/// longer added up), duplicate or blank SKUs were accepted, and bad deal values were stored.
/// </summary>
public class CatalogDataProtectionTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CatalogDataProtectionTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static UpsertProductRequest Product(string sku, string name = "Widget") =>
        new(sku, name, null, null, null, true, new Dictionary<string, string>());

    [Fact]
    public async Task DeleteProduct_IsRefusedOnceItAppearsOnAQuote_AndSucceedsWhenItHasNoHistory()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var withHistory = await admin.CreateProductAsync();
        var clean = await admin.CreateProductAsync();
        var quote = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(withHistory, 1)]));
        quote.EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/admin/products/{withHistory}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/admin/products/{withHistory}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/products/{clean}")).StatusCode);
    }

    [Fact]
    public async Task Skus_AreRequired_Trimmed_AndUniqueIgnoringCase()
    {
        var admin = await _factory.AdminAsync();
        var sku = $"Dup-{Guid.NewGuid():N}";

        var created = await admin.PostAsJsonAsync("/api/admin/products", Product($"  {sku}  "));
        var created2 = (await created.Content.ReadFromJsonAsync<ProductAdminDto>())!;
        var duplicate = await admin.PostAsJsonAsync("/api/admin/products", Product(sku.ToUpperInvariant()));
        var blankSku = await admin.PostAsJsonAsync("/api/admin/products", Product("   "));
        var blankName = await admin.PostAsJsonAsync("/api/admin/products", Product("OK-" + Guid.NewGuid().ToString("N"), " "));
        var tooLong = await admin.PostAsJsonAsync("/api/admin/products", Product(new string('s', 65)));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(sku, created2.Sku);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, blankSku.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, blankName.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    [Fact]
    public async Task UpdatingAProduct_CannotTakeAnotherProductsSku_ButMayKeepItsOwn()
    {
        var admin = await _factory.AdminAsync();
        var first = $"A-{Guid.NewGuid():N}";
        var second = $"B-{Guid.NewGuid():N}";
        await admin.CreateProductAsync(first);
        var secondId = await admin.CreateProductAsync(second);

        var steal = await admin.PutAsJsonAsync($"/api/admin/products/{secondId}", Product(first.ToLowerInvariant()));
        var keep = await admin.PutAsJsonAsync($"/api/admin/products/{secondId}", Product(second, "Renamed"));

        Assert.Equal(HttpStatusCode.Conflict, steal.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, keep.StatusCode);
    }

    private static UpsertDealRequest Deal(DiscountType type = DiscountType.Percent, decimal value = 10m, int startDays = -1, int endDays = 1, int minQty = 1)
    {
        var now = DateTime.UtcNow; // one clock read, so equal day offsets give equal instants
        return new("Promo", type, value, now.AddDays(startDays), now.AddDays(endDays), [], [], minQty);
    }

    [Theory]
    [InlineData(DiscountType.Percent, 150, -1, 1, 1)] // more than 100%
    [InlineData(DiscountType.Percent, -5, -1, 1, 1)] // negative
    [InlineData(DiscountType.Fixed, -5, -1, 1, 1)] // negative
    [InlineData(DiscountType.Percent, 10, 5, 1, 1)] // ends before it starts
    [InlineData(DiscountType.Percent, 10, 1, 1, 1)] // zero-length
    [InlineData(DiscountType.Percent, 10, -1, 1, 0)] // minimum quantity 0
    public async Task Deals_WithNonsenseValues_AreRejected(DiscountType type, int value, int startDays, int endDays, int minQty)
    {
        var admin = await _factory.AdminAsync();
        var response = await admin.PostAsJsonAsync("/api/admin/deals", Deal(type, value, startDays, endDays, minQty));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Deals_AcceptBoundaryValues_AndRejectBlankNameOnUpdateToo()
    {
        var admin = await _factory.AdminAsync();
        var full = await admin.PostAsJsonAsync("/api/admin/deals", Deal(DiscountType.Percent, 100m));
        var zero = await admin.PostAsJsonAsync("/api/admin/deals", Deal(DiscountType.Fixed, 0m));
        var dealId = (await full.Content.ReadFromJsonAsync<DealAdminDto>())!.Id;
        var blankName = await admin.PutAsJsonAsync($"/api/admin/deals/{dealId}", Deal() with { Name = " " });

        Assert.Equal(HttpStatusCode.Created, full.StatusCode);
        Assert.Equal(HttpStatusCode.Created, zero.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, blankName.StatusCode);
    }

    [Fact]
    public async Task Deals_AcceptDatesSentWithoutATimeZone_AsUtc()
    {
        var admin = await _factory.AdminAsync();
        // No "Z": this used to arrive as DateTimeKind.Unspecified, which Npgsql refuses to write (a 500 on real Postgres).
        var json = """{"name":"Naive","discountType":"Percent","discountValue":5,"startDate":"2026-10-01T00:00:00","endDate":"2026-12-31","productIds":[],"categoryIds":[],"minQty":1}""";

        var response = await admin.PostAsync("/api/admin/deals", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        var deal = await response.Content.ReadFromJsonAsync<DealAdminDto>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(DateTimeKind.Utc, deal!.StartDate.Kind);
        Assert.Equal(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), deal.StartDate);
    }

    [Fact]
    public async Task UpdatingADeal_WithoutCategoryIds_IsA400_NotAServerError()
    {
        var admin = await _factory.AdminAsync();
        var created = await admin.PostAsJsonAsync("/api/admin/deals", Deal());
        var id = (await created.Content.ReadFromJsonAsync<DealAdminDto>())!.Id;
        var body = """{"name":"x","discountType":"Percent","discountValue":5,"startDate":"2026-01-01T00:00:00Z","endDate":"2026-12-31T00:00:00Z","minQty":1}""";

        var response = await admin.PutAsync($"/api/admin/deals/{id}", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Deals_RejectAnUndefinedDiscountType()
    {
        var admin = await _factory.AdminAsync();
        var body = """{"name":"x","discountType":99,"discountValue":5,"startDate":"2026-01-01T00:00:00Z","endDate":"2026-12-31T00:00:00Z","productIds":[],"categoryIds":[],"minQty":1}""";

        var response = await admin.PostAsync("/api/admin/deals", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // A price of 0 reads as "free" to a visitor; an unpriced product must say so with null.
    [Fact]
    public async Task AnUnpricedProduct_HasANullPrice_NotZero_InTheListAndTheDetail()
    {
        var admin = await _factory.AdminAsync();
        var id = await admin.CreateProductAsync();
        await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest($"Default-{Guid.NewGuid():N}", true));
        var anonymous = _factory.CreateClient();

        var list = await anonymous.GetFromJsonAsync<List<ProductListItemDto>>("/api/products");
        var detail = await anonymous.GetFromJsonAsync<ProductDetailDto>($"/api/products/{id}");

        Assert.Null(list!.Single(p => p.Id == id).Price);
        Assert.Null(detail!.Price);
    }

    [Fact]
    public async Task ProductSearch_IgnoresCase_AndTreatsWildcardsAsPlainText()
    {
        var admin = await _factory.AdminAsync();
        var token = $"Zephyr{Guid.NewGuid():N}"[..14];
        var id = await admin.CreateProductAsync($"SKU-{token}", $"Cerveja {token} Lager");
        var anonymous = _factory.CreateClient();

        var lower = await anonymous.GetFromJsonAsync<List<ProductListItemDto>>($"/api/products?search={token.ToLowerInvariant()}");
        var upper = await anonymous.GetFromJsonAsync<List<ProductListItemDto>>($"/api/products?search={token.ToUpperInvariant()}");
        var percent = await anonymous.GetFromJsonAsync<List<ProductListItemDto>>("/api/products?search=%25");
        var underscore = await anonymous.GetFromJsonAsync<List<ProductListItemDto>>("/api/products?search=_");

        Assert.Contains(lower!, p => p.Id == id);
        Assert.Contains(upper!, p => p.Id == id);
        Assert.Empty(percent!);
        Assert.Empty(underscore!);
    }
}
