using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Tests.Support;

namespace Marvi.Tests.Catalog;

/// <summary>
/// The numbers behind the landing page (MRV-2.3b): a product count, a category count and the number of delivery areas the
/// check can serve. Anonymous, cacheable, and nothing private (no prices, no customers).
/// </summary>
public class PublicStatsTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public PublicStatsTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private async Task<JsonElement> StatsAsync() =>
        await _factory.CreateClient().GetFromJsonAsync<JsonElement>("/api/public/stats");

    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}";

    [Fact]
    public async Task Stats_AreAnonymous_AndExposeOnlyThreeCounts()
    {
        var response = await _factory.CreateClient().GetAsync("/api/public/stats");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            new[] { "categoryCount", "coverageAreaCount", "productCount" },
            body.EnumerateObject().Select(p => p.Name).OrderBy(n => n).ToArray());
        Assert.All(body.EnumerateObject(), p => Assert.Equal(JsonValueKind.Number, p.Value.ValueKind));
    }

    [Fact]
    public async Task Stats_CountOnlyActiveProductsAndActiveCategories()
    {
        var admin = await _factory.AdminAsync();
        var before = await StatsAsync();

        await admin.CreateProductAsync();
        await admin.CreateProductAsync();
        var inactive = await admin.PostAsJsonAsync("/api/admin/products",
            new UpsertProductRequest(Unique("SKU"), "Hidden", null, null, null, false, new Dictionary<string, string>()));
        inactive.EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(Unique("Cat"), 1, true))).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(Unique("Off"), 2, false))).EnsureSuccessStatusCode();
        var after = await StatsAsync();

        Assert.Equal(2, after.GetProperty("productCount").GetInt32() - before.GetProperty("productCount").GetInt32());
        Assert.Equal(1, after.GetProperty("categoryCount").GetInt32() - before.GetProperty("categoryCount").GetInt32());
    }

    // A polygon area is stored but the delivery check cannot serve it yet, so claiming it would overstate the network.
    [Fact]
    public async Task Stats_CountRadiusAreasOnly_NotPolygonAreas()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = (await (await admin.PostAsJsonAsync("/api/admin/warehouses",
            new UpsertWarehouseRequest(Unique("CD"), "Rua A, 1", -23.5, -46.6))).Content.ReadFromJsonAsync<WarehouseDto>())!;
        var before = await StatsAsync();

        (await admin.PostAsJsonAsync("/api/admin/coverage-areas", new UpsertCoverageAreaRequest(warehouse.Id, CoverageAreaType.Radius, 10, null))).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/admin/coverage-areas",
            new UpsertCoverageAreaRequest(warehouse.Id, CoverageAreaType.Polygon, null, "{\"type\":\"Polygon\",\"coordinates\":[]}"))).EnsureSuccessStatusCode();
        var after = await StatsAsync();

        Assert.Equal(1, after.GetProperty("coverageAreaCount").GetInt32() - before.GetProperty("coverageAreaCount").GetInt32());
    }

    [Theory]
    [InlineData("/api/public/stats")]
    [InlineData("/api/categories")]
    public async Task PublicLandingData_IsCacheableForAShortTime(string url)
    {
        var response = await _factory.CreateClient().GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.Public);
        Assert.Equal(TimeSpan.FromSeconds(60), response.Headers.CacheControl.MaxAge);
    }
}
