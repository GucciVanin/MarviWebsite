namespace Marvi.Domain.Catalog;

public class PricingResult
{
    public required decimal UnitPrice { get; init; }
    public Deal? AppliedDeal { get; init; }
}
