using Marvi.Domain.Coverage;
using Marvi.Domain.Delivery;
using Marvi.Domain.Identity;
using Marvi.Domain.Quotes;

namespace Marvi.Domain.Orders;

public class Order : IHasDeliveryAddress
{
    public Guid Id { get; set; }
    /// <summary>The order number (MRV-9.1), assigned once by the database on insert; unique, never reused, never changed.</summary>
    public int Number { get; set; }
    public Guid ClientAccountId { get; set; }
    public ClientAccount? ClientAccount { get; set; }
    public Guid? QuoteId { get; set; }
    public Quote? Quote { get; set; }
    public OrderStatus Status { get; set; }
    /// <summary>The address as one line of text: the legacy free text of an order made before MRV-9.6, otherwise the snapshot written out (<see cref="DeliveryAddressSnapshot.Line"/>).</summary>
    public string DeliveryAddress { get; set; } = string.Empty;
    /// <summary>The longest <see cref="DeliveryAddress"/> (a column limit): the legacy free text is refused above it and a snapshot written out as one line is cut to it.</summary>
    public const int MaxDeliveryAddressLength = 500;
    /// <summary>The address this order is delivered to (MRV-9.6): a snapshot of the chosen address, see <see cref="IHasDeliveryAddress"/>. Staff may amend it until the order is shipped.</summary>
    public Guid? DeliveryAddressId { get; set; }
    public string? DeliveryAddressLabel { get; set; }
    public string? DeliveryAddressStreet { get; set; }
    public string? DeliveryAddressNumber { get; set; }
    public string? DeliveryAddressComplement { get; set; }
    public string? DeliveryAddressDistrict { get; set; }
    public string? DeliveryAddressCity { get; set; }
    public string? DeliveryAddressState { get; set; }
    public string? DeliveryAddressPostalCode { get; set; }
    public string? DeliveryAddressNotes { get; set; }
    public Guid? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public Guid? PlacedByEmployeeId { get; set; }
    public EmployeeAccount? PlacedByEmployee { get; set; }
    /// <summary>When the order was placed (UTC). Set by <see cref="OrderFactory"/>; the history is filtered and sorted by it.</summary>
    public DateTime PlacedAt { get; set; }
    public decimal TotalAmount { get; set; }
    public List<OrderLineItem> LineItems { get; set; } = new();

    /// <summary>Staff may amend the address until the order is shipped: a Placed or Backordered order. A Fulfilled (shipped or delivered) or Cancelled order is closed.</summary>
    public bool CanAmendDeliveryAddress => Status is OrderStatus.Placed or OrderStatus.Backordered;

    /// <summary>Replaces the delivery address with a new snapshot (and the one-line text with it). Throws when the order is closed.</summary>
    public void ChangeDeliveryAddress(ClientAddress address)
    {
        if (!CanAmendDeliveryAddress)
        {
            throw new InvalidOperationException($"The delivery address of an order can only change before it is shipped, but it was '{Status}'.");
        }

        this.CopyFrom(address);
        DeliveryAddress = DeliveryAddressSnapshot.LineForText(this);
    }
}
