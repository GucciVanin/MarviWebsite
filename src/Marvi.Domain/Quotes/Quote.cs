using Marvi.Domain.Delivery;
using Marvi.Domain.Identity;

namespace Marvi.Domain.Quotes;

public class Quote : IHasDeliveryAddress
{
    public Guid Id { get; set; }
    /// <summary>The quote number (MRV-9.1), assigned once by the database on insert; unique, never reused, never changed.</summary>
    public int Number { get; set; }
    public Guid ClientAccountId { get; set; }
    public ClientAccount? ClientAccount { get; set; }
    public QuoteStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid? PricedByEmployeeId { get; set; }
    public EmployeeAccount? PricedByEmployee { get; set; }
    /// <summary>The address this quote is delivered to (MRV-9.6): a snapshot of the chosen address, changeable until the quote is accepted. See <see cref="IHasDeliveryAddress"/>.</summary>
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
    public List<QuoteLineItem> LineItems { get; set; } = new();
}
