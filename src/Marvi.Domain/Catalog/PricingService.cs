namespace Marvi.Domain.Catalog;

public class PricingService
{
    public PricingResult ResolvePrice(Product product, PricingTier tier, IEnumerable<ProductPricing> pricingRows, IEnumerable<Deal> activeDeals, int qty)
    {
        var basePrice = pricingRows
            .Where(p => p.ProductId == product.Id && p.PricingTierId == tier.Id && p.MinQty <= qty)
            .OrderByDescending(p => p.MinQty)
            .Select(p => (decimal?)p.UnitPrice)
            .FirstOrDefault()
            ?? throw new NoPriceException($"No pricing found for product '{product.Id}' and tier '{tier.Id}'.");

        var now = DateTime.UtcNow;
        var applicableDeals = activeDeals.Where(d =>
            d.StartDate <= now && d.EndDate >= now &&
            qty >= d.MinQty &&
            (d.ProductIds.Contains(product.Id) || (product.CategoryId.HasValue && d.CategoryIds.Contains(product.CategoryId.Value))));

        Deal? bestDeal = null;
        var bestPrice = basePrice;

        foreach (var deal in applicableDeals)
        {
            var discounted = deal.DiscountType switch
            {
                DiscountType.Percent => basePrice * (1 - deal.DiscountValue / 100m),
                DiscountType.Fixed => basePrice - deal.DiscountValue,
                _ => basePrice
            };

            if (discounted < 0)
            {
                discounted = 0;
            }

            if (discounted < bestPrice)
            {
                bestPrice = discounted;
                bestDeal = deal;
            }
        }

        return new PricingResult { UnitPrice = bestPrice, AppliedDeal = bestDeal };
    }
}
