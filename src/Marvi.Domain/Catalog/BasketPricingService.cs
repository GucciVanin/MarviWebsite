using System.Text.Json.Serialization;

namespace Marvi.Domain.Catalog;

/// <summary>One requested product and quantity in a Basket.</summary>
public record BasketLine(Guid ProductId, int Qty);

/// <summary>
/// A Basket line after pricing. <see cref="Product"/> is null when the product does not exist; <see cref="UnitPrice"/>
/// is null when the Customer's pricing tier has no price for it (never 0: a missing price is not a free product).
/// </summary>
public record PricedBasketLine(Guid ProductId, Product? Product, int Qty, decimal? UnitPrice, string? DealName);

// Serialized by name like every public Domain enum (EnumContractTests); it is not returned by the API today.
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum BasketProblem
{
    NoLines,
    InvalidQuantity,
    NoPricingTier
}

/// <summary>Lines are in the order they were requested. <see cref="Problem"/> is set when nothing could be priced.</summary>
public record BasketPricing(IReadOnlyList<PricedBasketLine> Lines, BasketProblem? Problem);

/// <summary>What pricing a Basket needs, already loaded. Deals may be any; only those running at pricing time apply.</summary>
public record PricingData(
    PricingTier? Tier,
    IReadOnlyDictionary<Guid, Product> Products,
    IReadOnlyCollection<ProductPricing> PricingRows,
    IReadOnlyCollection<Deal> Deals);

/// <summary>
/// Prices a Basket for a Customer's pricing tier: quantity breaks, the best running Deal, and "no price" as a result
/// instead of an exception. Quotes, employee orders and the public catalog all price through here, so they cannot disagree.
/// </summary>
public class BasketPricingService
{
    private readonly PricingService _pricingService;

    public BasketPricingService(PricingService pricingService)
    {
        _pricingService = pricingService;
    }

    /// <summary>The shape of a Basket request, checked before anything else (and before who is asking).</summary>
    public BasketProblem? Validate(IReadOnlyCollection<BasketLine>? lines)
    {
        if (lines is null || lines.Count == 0)
        {
            return BasketProblem.NoLines;
        }

        return lines.Any(l => l.Qty < 1) ? BasketProblem.InvalidQuantity : null;
    }

    public BasketPricing Price(IReadOnlyList<BasketLine> lines, PricingData data)
    {
        if (data.Tier is null)
        {
            return new BasketPricing([], BasketProblem.NoPricingTier);
        }

        var priced = lines
            .Select(line => data.Products.TryGetValue(line.ProductId, out var product)
                ? PriceLine(product, data.Tier, data.PricingRows, data.Deals, line.Qty)
                : new PricedBasketLine(line.ProductId, null, line.Qty, null, null))
            .ToList();
        return new BasketPricing(priced, null);
    }

    /// <summary>One product at one quantity, e.g. the catalog's "from" price at quantity 1.</summary>
    public PricedBasketLine PriceLine(Product product, PricingTier tier, IEnumerable<ProductPricing> pricingRows, IEnumerable<Deal> deals, int qty)
    {
        try
        {
            var result = _pricingService.ResolvePrice(product, tier, pricingRows, deals, qty);
            return new PricedBasketLine(product.Id, product, qty, result.UnitPrice, result.AppliedDeal?.Name);
        }
        catch (NoPriceException)
        {
            // Only "no price row for this product and tier"; any other failure is a bug and must surface.
            return new PricedBasketLine(product.Id, product, qty, null, null);
        }
    }
}
