using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Coverage;

/// <summary>
/// What a visitor is told by the coverage check (MRV-4.8): the geocoding outcome is internal, so an address the provider
/// does not know and a provider that is down both get the same plain "not covered" answer they always did.
/// </summary>
public class CoverageCheckResponseTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CoverageCheckResponseTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("an address nobody has heard of")]
    [InlineData(FakeGeocodingProvider.UnavailableAddress)]
    public async Task AnAddressThatCannotBeLocated_IsNotCovered_WhateverTheReason(string address)
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/coverage/check", new CoverageCheckRequest(address));
        var result = await response.Content.ReadFromJsonAsync<CoverageCheckResultDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(result!.Supported);
        Assert.Null(result.WarehouseName);
    }

    // ---- which coverage areas count: radius areas are evaluated, polygon areas are not supported yet and never cover

    private async Task<string> WarehouseWithAsync(double lat, double lng, params (CoverageAreaType Type, double? Radius)[] areas)
    {
        var name = $"WH {Guid.NewGuid():N}";
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var warehouse = new Warehouse { Id = Guid.NewGuid(), Name = name, Address = "x", Latitude = lat, Longitude = lng };
        db.Warehouses.Add(warehouse);
        foreach (var (type, radius) in areas)
        {
            db.CoverageAreas.Add(new CoverageArea
            {
                Id = Guid.NewGuid(), WarehouseId = warehouse.Id, Type = type, RadiusMiles = radius,
                PolygonGeoJson = type == CoverageAreaType.Polygon ? "{\"type\":\"Polygon\",\"coordinates\":[]}" : null
            });
        }

        await db.SaveChangesAsync();
        return name;
    }

    private async Task<CoverageCheckResultDto> CheckAsync(double lat, double lng) =>
        (await (await _factory.CreateClient().PostAsJsonAsync("/api/coverage/check", new CoverageCheckRequest($"{lat},{lng}"))).Content.ReadFromJsonAsync<CoverageCheckResultDto>())!;

    [Fact]
    public async Task AWarehouseWithOnlyAPolygonArea_NeverCovers_AndDoesNotBreakTheCheck()
    {
        await WarehouseWithAsync(31, 31, (CoverageAreaType.Polygon, null));

        var result = await CheckAsync(31, 31);

        Assert.False(result.Supported);
    }

    [Fact]
    public async Task APolygonAreaBesideARadiusArea_DoesNotStopTheRadiusAreaCovering()
    {
        var name = await WarehouseWithAsync(32, 32, (CoverageAreaType.Polygon, null), (CoverageAreaType.Radius, 10));

        var result = await CheckAsync(32.01, 32);

        Assert.True(result.Supported);
        Assert.Equal(name, result.WarehouseName);
    }

    [Fact]
    public async Task AWarehouseWithNoAreas_NeverCovers()
    {
        await WarehouseWithAsync(33, 33);

        Assert.False((await CheckAsync(33, 33)).Supported);
    }
}
