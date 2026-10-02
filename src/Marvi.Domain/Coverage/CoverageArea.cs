namespace Marvi.Domain.Coverage;

public class CoverageArea
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public CoverageAreaType Type { get; set; }
    public double? RadiusMiles { get; set; }
    public string? PolygonGeoJson { get; set; }
}
