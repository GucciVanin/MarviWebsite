using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Tests.Support;

namespace Marvi.Tests.Coverage;

/// <summary>MRV-3.5: list, get-by-id and not-found contract of the warehouse and coverage-area admin endpoints.</summary>
public class CoverageAdminEndpointContractTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CoverageAdminEndpointContractTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<WarehouseDto> CreateWarehouseAsync(HttpClient admin)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest($"CD {Guid.NewGuid():N}", "Rua A, 1", -23.5, -46.6));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WarehouseDto>())!;
    }

    [Fact]
    public async Task Warehouses_ListAndGetById_ReturnTheWarehouse_AndUnknownIdsAre404()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);

        var list = (await admin.GetFromJsonAsync<List<WarehouseDto>>("/api/admin/warehouses"))!;
        var one = await admin.GetAsync($"/api/admin/warehouses/{warehouse.Id}");

        Assert.Contains(list, w => w.Id == warehouse.Id);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
        var dto = (await one.Content.ReadFromJsonAsync<WarehouseDto>())!;
        Assert.Equal(warehouse.Name, dto.Name);
        Assert.Equal(-23.5, dto.Latitude);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/warehouses/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/warehouses/{Guid.NewGuid()}", new UpsertWarehouseRequest("X", "Y", 0, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/warehouses/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task Warehouses_Update_ChangesTheFields()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);

        var response = await admin.PutAsJsonAsync($"/api/admin/warehouses/{warehouse.Id}", new UpsertWarehouseRequest("Renamed", "Rua B, 2", 10, 20));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var dto = (await admin.GetFromJsonAsync<WarehouseDto>($"/api/admin/warehouses/{warehouse.Id}"))!;
        Assert.Equal("Renamed", dto.Name);
        Assert.Equal(20, dto.Longitude);
    }

    [Fact]
    public async Task CoverageAreas_ListAndGetById_ReturnTheArea_AndUnknownIdsAre404()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);
        var created = await admin.PostAsJsonAsync("/api/admin/coverage-areas", new UpsertCoverageAreaRequest(warehouse.Id, CoverageAreaType.Radius, 12, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var area = (await created.Content.ReadFromJsonAsync<CoverageAreaDto>())!;

        var list = (await admin.GetFromJsonAsync<List<CoverageAreaDto>>("/api/admin/coverage-areas"))!;
        var one = await admin.GetAsync($"/api/admin/coverage-areas/{area.Id}");

        Assert.Contains(list, a => a.Id == area.Id);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
        Assert.Equal(12, (await one.Content.ReadFromJsonAsync<CoverageAreaDto>())!.RadiusMiles);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/coverage-areas/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/coverage-areas/{Guid.NewGuid()}", new UpsertCoverageAreaRequest(warehouse.Id, CoverageAreaType.Radius, 5, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/coverage-areas/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task CoverageAreas_Delete_RemovesTheArea()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin);
        var area = (await (await admin.PostAsJsonAsync("/api/admin/coverage-areas", new UpsertCoverageAreaRequest(warehouse.Id, CoverageAreaType.Radius, 3, null))).Content.ReadFromJsonAsync<CoverageAreaDto>())!;

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/coverage-areas/{area.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/coverage-areas/{area.Id}")).StatusCode);
    }
}
