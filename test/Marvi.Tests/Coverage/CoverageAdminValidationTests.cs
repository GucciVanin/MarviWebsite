using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Tests.Support;

namespace Marvi.Tests.Coverage;

public class CoverageAdminValidationTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CoverageAdminValidationTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<Guid> CreateWarehouseAsync(HttpClient admin, double lat = -23.5, double lng = -46.6)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest($"CD {Guid.NewGuid():N}", "Rua A, 1", lat, lng));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WarehouseDto>())!.Id;
    }

    [Theory]
    [InlineData("", "Rua A", 0, 0)]
    [InlineData("CD", " ", 0, 0)]
    [InlineData("CD", "Rua A", 91, 0)]
    [InlineData("CD", "Rua A", -91, 0)]
    [InlineData("CD", "Rua A", 0, 181)]
    [InlineData("CD", "Rua A", 0, -181)]
    public async Task Warehouses_WithMissingFieldsOrImpossibleCoordinates_AreRejected(string name, string address, double lat, double lng)
    {
        var admin = await _factory.AdminAsync();
        var response = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(name, address, lat, lng));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Warehouses_AcceptTheExactCoordinateLimits_AndRejectBadUpdates()
    {
        var admin = await _factory.AdminAsync();
        var edge = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest("Edge", "x", 90, -180));
        var id = await CreateWarehouseAsync(admin);
        var badUpdate = await admin.PutAsJsonAsync($"/api/admin/warehouses/{id}", new UpsertWarehouseRequest("Edge", "x", 100, 0));

        Assert.Equal(HttpStatusCode.Created, edge.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badUpdate.StatusCode);
    }

    [Fact]
    public async Task CoverageAreas_NeedARealWarehouse_AndASensibleRadius()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);
        Task<HttpResponseMessage> Create(Guid w, CoverageAreaType type, double? radius, string? geo = null) =>
            admin.PostAsJsonAsync("/api/admin/coverage-areas", new UpsertCoverageAreaRequest(w, type, radius, geo));

        Assert.Equal(HttpStatusCode.BadRequest, (await Create(Guid.NewGuid(), CoverageAreaType.Radius, 5)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(warehouse, CoverageAreaType.Radius, -10)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(warehouse, CoverageAreaType.Radius, 0)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(warehouse, CoverageAreaType.Radius, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(warehouse, CoverageAreaType.Radius, 20001)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(warehouse, CoverageAreaType.Polygon, null, " ")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Create(warehouse, CoverageAreaType.Radius, 25)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Create(warehouse, CoverageAreaType.Polygon, null, "{\"type\":\"Polygon\"}")).StatusCode);
    }

    [Fact]
    public async Task CoverageAreas_RejectAnUndefinedType_AndPolygonsThatAreNotJsonObjects()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);
        // Anonymous bodies so the type can be an undefined number (99), which the typed request record cannot express.
        Task<HttpResponseMessage> Post(object type, string? geoJson) =>
            admin.PostAsJsonAsync("/api/admin/coverage-areas", new { warehouseId = warehouse, type, radiusMiles = (double?)null, polygonGeoJson = geoJson });

        Assert.Equal(HttpStatusCode.BadRequest, (await Post(99, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("Polygon", "x")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("Polygon", "[1,2]")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Post("Polygon", "{\"type\":\"Polygon\",\"coordinates\":[]}")).StatusCode);
    }

    [Fact]
    public async Task ARadiusArea_DoesNotKeepAStrayPolygon()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);

        var response = await admin.PostAsJsonAsync("/api/admin/coverage-areas",
            new UpsertCoverageAreaRequest(warehouse, CoverageAreaType.Radius, 10, "{\"type\":\"Polygon\"}"));
        var area = await response.Content.ReadFromJsonAsync<CoverageAreaDto>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Null(area!.PolygonGeoJson);
    }

    [Fact]
    public async Task UpdatingACoverageArea_IsValidatedToo()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);
        var created = await admin.PostAsJsonAsync("/api/admin/coverage-areas", new UpsertCoverageAreaRequest(warehouse, CoverageAreaType.Radius, 10, null));
        var id = (await created.Content.ReadFromJsonAsync<CoverageAreaDto>())!.Id;

        var bad = await admin.PutAsJsonAsync($"/api/admin/coverage-areas/{id}", new UpsertCoverageAreaRequest(Guid.NewGuid(), CoverageAreaType.Radius, 10, null));
        var good = await admin.PutAsJsonAsync($"/api/admin/coverage-areas/{id}", new UpsertCoverageAreaRequest(warehouse, CoverageAreaType.Radius, 15, null));

        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, good.StatusCode);
    }

    [Fact]
    // The cascade of coverage areas is a database rule (the in-memory provider does not apply it); the runtime test checks it on Postgres.
    public async Task DeletingAWarehouse_IsRefusedWhileItHoldsStock_AndAllowedWhenEmpty()
    {
        var admin = await _factory.AdminAsync();
        var stocked = await CreateWarehouseAsync(admin);
        var empty = await CreateWarehouseAsync(admin);
        var product = await admin.CreateProductAsync();
        (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, stocked, 10, 2))).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/admin/warehouses/{stocked}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/warehouses/{empty}")).StatusCode);
    }
}
