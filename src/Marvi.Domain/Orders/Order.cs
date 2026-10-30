using Marvi.Domain.Coverage;
using Marvi.Domain.Identity;
using Marvi.Domain.Quotes;

namespace Marvi.Domain.Orders;

public class Order
{
    public Guid Id { get; set; }
    /// <summary>The order number (MRV-9.1), assigned once by the database on insert; unique, never reused, never changed.</summary>
    public int Number { get; set; }
    public Guid ClientAccountId { get; set; }
    public ClientAccount? ClientAccount { get; set; }
    public Guid? QuoteId { get; set; }
    public Quote? Quote { get; set; }
    public OrderStatus Status { get; set; }
    public string DeliveryAddress { get; set; } = string.Empty;
    public Guid? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public Guid? PlacedByEmployeeId { get; set; }
    public EmployeeAccount? PlacedByEmployee { get; set; }
    /// <summary>When the order was placed (UTC). Set by <see cref="OrderFactory"/>; the history is filtered and sorted by it.</summary>
    public DateTime PlacedAt { get; set; }
    public decimal TotalAmount { get; set; }
    public List<OrderLineItem> LineItems { get; set; } = new();
}
