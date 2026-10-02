namespace Marvi.Domain.Catalog;

public class ProductPricing
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public Guid PricingTierId { get; set; }
    public PricingTier? PricingTier { get; set; }
    public decimal UnitPrice { get; set; }
    public int MinQty { get; set; }
}
