using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Tests.Support;

namespace Marvi.Tests.Catalog;

/// <summary>MRV-3.5: the success and not-found/validation contract of the catalog endpoints no other test pins directly.</summary>
public class CatalogEndpointContractTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CatalogEndpointContractTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static UpsertDealRequest Deal(string name, Guid productId, DateTime start, DateTime end) =>
        new(name, DiscountType.Percent, 10m, start, end, [productId], [], 1);

    [Fact]
    public async Task PublicDeals_ListsOnlyTheDealsRunningNow()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var now = DateTime.UtcNow;
        var running = await (await admin.PostAsJsonAsync("/api/admin/deals", Deal("Running", productId, now.AddDays(-1), now.AddDays(1)))).Content.ReadFromJsonAsync<DealAdminDto>();
        var expired = await (await admin.PostAsJsonAsync("/api/admin/deals", Deal("Expired", productId, now.AddDays(-10), now.AddDays(-5)))).Content.ReadFromJsonAsync<DealAdminDto>();
        var future = await (await admin.PostAsJsonAsync("/api/admin/deals", Deal("Future", productId, now.AddDays(5), now.AddDays(10)))).Content.ReadFromJsonAsync<DealAdminDto>();

        var response = await _factory.CreateClient().GetAsync("/api/deals");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var deals = (await response.Content.ReadFromJsonAsync<List<DealDto>>())!;
        Assert.Contains(deals, d => d.Id == running!.Id && d.Name == "Running" && d.DiscountValue == 10m);
        Assert.DoesNotContain(deals, d => d.Id == expired!.Id);
        Assert.DoesNotContain(deals, d => d.Id == future!.Id);
    }

    [Fact]
    public async Task AdminDeals_ListAndGetById_ReturnTheDeal_AndUnknownIdsAre404()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var now = DateTime.UtcNow;
        var created = (await (await admin.PostAsJsonAsync("/api/admin/deals", Deal("Listed", productId, now.AddDays(-1), now.AddDays(1)))).Content.ReadFromJsonAsync<DealAdminDto>())!;

        var list = (await admin.GetFromJsonAsync<List<DealAdminDto>>("/api/admin/deals"))!;
        var one = await admin.GetAsync($"/api/admin/deals/{created.Id}");

        Assert.Contains(list, d => d.Id == created.Id);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
        Assert.Equal("Listed", (await one.Content.ReadFromJsonAsync<DealAdminDto>())!.Name);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/deals/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/deals/{Guid.NewGuid()}", Deal("X", productId, now, now.AddDays(1)))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/deals/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task AdminDeals_Delete_RemovesTheDeal()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var now = DateTime.UtcNow;
        var created = (await (await admin.PostAsJsonAsync("/api/admin/deals", Deal("Gone", productId, now.AddDays(-1), now.AddDays(1)))).Content.ReadFromJsonAsync<DealAdminDto>())!;

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/deals/{created.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/deals/{created.Id}")).StatusCode);
    }

    [Fact]
    public async Task UnknownProductsAndCategories_Are404_OnThePublicAndTheAdminEndpoints()
    {
        var admin = await _factory.AdminAsync();
        var unknown = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await _factory.CreateClient().GetAsync($"/api/products/{unknown}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/products/{unknown}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/products/{unknown}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/categories/{unknown}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/categories/{unknown}")).StatusCode);
    }

    [Fact]
    public async Task ProductPricing_GetListsTheRowsOfTheProduct()
    {
        var admin = await _factory.AdminAsync();
        await _factory.RegisterClientAsync(); // creates the default tier
        var productId = await admin.CreatePricedProductAsync(12.5m);

        var response = await admin.GetAsync($"/api/admin/products/{productId}/pricing");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = (await response.Content.ReadFromJsonAsync<List<ProductPricingDto>>())!;
        var row = Assert.Single(rows);
        Assert.Equal(12.5m, row.UnitPrice);
        Assert.Equal(1, row.MinQty);
    }

    [Fact]
    public async Task ProductPricing_RejectsUnknownProducts_UnknownTiers_AndBadNumbers()
    {
        var admin = await _factory.AdminAsync();
        await _factory.RegisterClientAsync();
        var productId = await admin.CreateProductAsync();
        var tier = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!.Single(t => t.IsDefault);

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/products/{Guid.NewGuid()}/pricing")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/products/{Guid.NewGuid()}/pricing", new UpsertProductPricingRequest(tier.Id, 5m, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing", new UpsertProductPricingRequest(Guid.NewGuid(), 5m, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing", new UpsertProductPricingRequest(tier.Id, -1m, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing", new UpsertProductPricingRequest(tier.Id, 5m, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/products/{productId}/pricing/{tier.Id}/1")).StatusCode);
    }

    [Fact]
    public async Task PricingTiers_UpdateOfAnUnknownTier_Is404_AndABlankNameIs400()
    {
        var admin = await _factory.AdminAsync();
        var created = (await (await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest($"Tier {Guid.NewGuid():N}", false))).Content.ReadFromJsonAsync<PricingTierDto>())!;

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/pricing-tiers/{Guid.NewGuid()}", new UpsertPricingTierRequest("X", false))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/pricing-tiers/{created.Id}", new UpsertPricingTierRequest("  ", false))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(" ", false))).StatusCode);
    }
}
