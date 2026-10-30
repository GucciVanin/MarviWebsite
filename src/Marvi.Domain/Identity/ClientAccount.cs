using Marvi.Domain.Catalog;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;

namespace Marvi.Domain.Identity;

public class ClientAccount
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    /// <summary>
    /// The customer number (MRV-9.1): a short business reference staff read out, unlike the id, which no screen shows. Assigned once
    /// by the database when the customer registers (a sequence, so it is unique and never reused) and never changed.
    /// </summary>
    public int Number { get; set; }
    /// <summary>When the customer registered (UTC).</summary>
    public DateTime CreatedAt { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    /// <summary>The customer's named addresses (MRV-9.3): one is the billing address, one the default delivery address.</summary>
    public List<ClientAddress> Addresses { get; set; } = new();
    public Guid? PricingTierId { get; set; }
    public PricingTier? PricingTier { get; set; }
    public ClientAccountStatus Status { get; set; }
    public List<Quote> Quotes { get; set; } = new();
    public List<Order> Orders { get; set; } = new();
}
