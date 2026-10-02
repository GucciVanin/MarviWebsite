using Marvi.Domain.Inventory;

namespace Marvi.Domain.Coverage;

public class Warehouse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public List<CoverageArea> CoverageAreas { get; set; } = new();
    public List<InventoryRecord> InventoryRecords { get; set; } = new();
}
