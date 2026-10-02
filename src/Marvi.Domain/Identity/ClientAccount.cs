using Marvi.Domain.Catalog;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;

namespace Marvi.Domain.Identity;

public class ClientAccount
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public string BillingAddress { get; set; } = string.Empty;
    public List<string> ShippingAddresses { get; set; } = new();
    public decimal CreditLimit { get; set; }
    public Guid? PricingTierId { get; set; }
    public PricingTier? PricingTier { get; set; }
    public ClientAccountStatus Status { get; set; }
    public List<Quote> Quotes { get; set; } = new();
    public List<Order> Orders { get; set; } = new();
}
