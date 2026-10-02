namespace Marvi.Domain.Catalog;

public class PricingTier
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>The tier used for anonymous visitors and assigned to newly registered clients. Exactly one tier should be default.</summary>
    public bool IsDefault { get; set; }
    public List<ProductPricing> ProductPricings { get; set; } = new();
}
