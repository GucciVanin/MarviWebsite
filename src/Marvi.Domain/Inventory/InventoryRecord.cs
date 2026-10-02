using Marvi.Domain.Catalog;
using Marvi.Domain.Coverage;

namespace Marvi.Domain.Inventory;

public class InventoryRecord
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public Guid WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public int QtyOnHand { get; set; }
    public int QtyReserved { get; set; }
    public int ReorderPoint { get; set; }
}
