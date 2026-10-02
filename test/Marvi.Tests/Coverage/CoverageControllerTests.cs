using System.Net.Http.Json;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Coverage;

public class CoverageControllerTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;
    private readonly HttpClient _client;

    public CoverageControllerTests(MarviApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Check_ReturnsSupported_ForPointInsideSeededWarehouseRadius()
    {
        var warehouseId = Guid.NewGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Warehouses.Add(new Warehouse { Id = warehouseId, Name = "Main Warehouse", Address = "1 Depot Rd", Latitude = 40.0, Longitude = -75.0 });
            db.CoverageAreas.Add(new CoverageArea { Id = Guid.NewGuid(), WarehouseId = warehouseId, Type = CoverageAreaType.Radius, RadiusMiles = 10 });
            await db.SaveChangesAsync();
        }

        // FakeGeocodingProvider parses "lat,lng" directly - this point is inside the 10 mile radius.
        var response = await _client.PostAsJsonAsync("/api/coverage/check", new CoverageCheckRequest("40.01,-75.0"));
        var result = await response.Content.ReadFromJsonAsync<CoverageCheckResultDto>();

        Assert.NotNull(result);
        Assert.True(result!.Supported);
        Assert.Equal("Main Warehouse", result.WarehouseName);
    }

    [Fact]
    public async Task Check_ReturnsNotSupported_ForPointOutsideSeededWarehouseRadius()
    {
        var warehouseId = Guid.NewGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // Deliberately far from any other seeded warehouse in this fixture so radius checks stay unambiguous.
            db.Warehouses.Add(new Warehouse { Id = warehouseId, Name = "Far Warehouse", Address = "2 Depot Rd", Latitude = 0.0, Longitude = 0.0 });
            db.CoverageAreas.Add(new CoverageArea { Id = Guid.NewGuid(), WarehouseId = warehouseId, Type = CoverageAreaType.Radius, RadiusMiles = 10 });
            await db.SaveChangesAsync();
        }

        var response = await _client.PostAsJsonAsync("/api/coverage/check", new CoverageCheckRequest("10.0,10.0"));
        var result = await response.Content.ReadFromJsonAsync<CoverageCheckResultDto>();

        Assert.NotNull(result);
        Assert.False(result!.Supported);
        Assert.Null(result.WarehouseName);
    }
}
