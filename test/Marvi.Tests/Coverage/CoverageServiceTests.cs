using Marvi.Domain.Coverage;

namespace Marvi.Tests.Coverage;

public class CoverageServiceTests
{
    private readonly CoverageService _sut = new();

    private static Warehouse CreateWarehouse() => new()
    {
        Id = Guid.NewGuid(),
        Name = "Main Warehouse",
        Latitude = 40.0,
        Longitude = -75.0
    };

    [Fact]
    public void CheckCoverage_PointInsideRadius_ReturnsSupportedWithWarehouse()
    {
        var warehouse = CreateWarehouse();
        var area = new CoverageArea { Id = Guid.NewGuid(), WarehouseId = warehouse.Id, Type = CoverageAreaType.Radius, RadiusMiles = 10 };

        // ~0.7 miles from the warehouse, well inside the 10 mile radius.
        var result = _sut.CheckCoverage(40.01, -75.0, [(warehouse, area)]);

        Assert.True(result.Supported);
        Assert.Same(warehouse, result.Warehouse);
    }

    [Fact]
    public void CheckCoverage_PointOutsideRadius_ReturnsNotSupported()
    {
        var warehouse = CreateWarehouse();
        var area = new CoverageArea { Id = Guid.NewGuid(), WarehouseId = warehouse.Id, Type = CoverageAreaType.Radius, RadiusMiles = 10 };

        var result = _sut.CheckCoverage(10.0, 10.0, [(warehouse, area)]);

        Assert.False(result.Supported);
        Assert.Null(result.Warehouse);
    }

    [Fact]
    public void CheckCoverage_PolygonArea_ThrowsNotSupportedException()
    {
        var warehouse = CreateWarehouse();
        var area = new CoverageArea { Id = Guid.NewGuid(), WarehouseId = warehouse.Id, Type = CoverageAreaType.Polygon, PolygonGeoJson = "{}" };

        Assert.Throws<NotSupportedException>(() => _sut.CheckCoverage(40.0, -75.0, [(warehouse, area)]));
    }
}
