using Marvi.Domain.Catalog;

namespace Marvi.Tests.Catalog;

public class PricingServiceTests
{
    private readonly PricingService _sut = new();

    private static Product CreateProduct() => new() { Id = Guid.NewGuid(), Sku = "SKU-1", Name = "Widget" };

    [Fact]
    public void ResolvePrice_AppliesHighestQualifyingTierBreak()
    {
        var product = CreateProduct();
        var tier = new PricingTier { Id = Guid.NewGuid(), Name = "Wholesale" };
        var pricingRows = new List<ProductPricing>
        {
            new() { ProductId = product.Id, PricingTierId = tier.Id, MinQty = 1, UnitPrice = 100m },
            new() { ProductId = product.Id, PricingTierId = tier.Id, MinQty = 10, UnitPrice = 90m },
        };

        var result = _sut.ResolvePrice(product, tier, pricingRows, activeDeals: [], qty: 15);

        Assert.Equal(90m, result.UnitPrice);
        Assert.Null(result.AppliedDeal);
    }

    [Fact]
    public void ResolvePrice_AppliesActiveDeal_WhenItLowersPrice()
    {
        var product = CreateProduct();
        var tier = new PricingTier { Id = Guid.NewGuid(), Name = "Wholesale" };
        var pricingRows = new List<ProductPricing>
        {
            new() { ProductId = product.Id, PricingTierId = tier.Id, MinQty = 1, UnitPrice = 100m },
        };
        var deal = new Deal
        {
            Id = Guid.NewGuid(),
            DiscountType = DiscountType.Percent,
            DiscountValue = 20m,
            StartDate = DateTime.UtcNow.AddDays(-1),
            EndDate = DateTime.UtcNow.AddDays(1),
            MinQty = 1,
            ProductIds = [product.Id]
        };

        var result = _sut.ResolvePrice(product, tier, pricingRows, activeDeals: [deal], qty: 1);

        Assert.Equal(80m, result.UnitPrice);
        Assert.Same(deal, result.AppliedDeal);
    }

    [Fact]
    public void ResolvePrice_DoesNotApplyDeal_WhenOutsideDateRange()
    {
        var product = CreateProduct();
        var tier = new PricingTier { Id = Guid.NewGuid(), Name = "Wholesale" };
        var pricingRows = new List<ProductPricing>
        {
            new() { ProductId = product.Id, PricingTierId = tier.Id, MinQty = 1, UnitPrice = 100m },
        };
        var expiredDeal = new Deal
        {
            Id = Guid.NewGuid(),
            DiscountType = DiscountType.Percent,
            DiscountValue = 20m,
            StartDate = DateTime.UtcNow.AddDays(-10),
            EndDate = DateTime.UtcNow.AddDays(-1),
            MinQty = 1,
            ProductIds = [product.Id]
        };

        var result = _sut.ResolvePrice(product, tier, pricingRows, activeDeals: [expiredDeal], qty: 1);

        Assert.Equal(100m, result.UnitPrice);
        Assert.Null(result.AppliedDeal);
    }

    [Fact]
    public void ResolvePrice_DoesNotApplyDeal_WhenBelowMinQty()
    {
        var product = CreateProduct();
        var tier = new PricingTier { Id = Guid.NewGuid(), Name = "Wholesale" };
        var pricingRows = new List<ProductPricing>
        {
            new() { ProductId = product.Id, PricingTierId = tier.Id, MinQty = 1, UnitPrice = 100m },
        };
        var deal = new Deal
        {
            Id = Guid.NewGuid(),
            DiscountType = DiscountType.Percent,
            DiscountValue = 20m,
            StartDate = DateTime.UtcNow.AddDays(-1),
            EndDate = DateTime.UtcNow.AddDays(1),
            MinQty = 10,
            ProductIds = [product.Id]
        };

        var result = _sut.ResolvePrice(product, tier, pricingRows, activeDeals: [deal], qty: 1);

        Assert.Equal(100m, result.UnitPrice);
        Assert.Null(result.AppliedDeal);
    }

    // The public catalog catches exactly this type (so it shows "on request" for an unpriced product) and must not
    // swallow other InvalidOperationExceptions, which would be pricing bugs.
    [Fact]
    public void ResolvePrice_ThrowsTheSpecificNoPriceException_WhenNoRowMatches()
    {
        var product = new Product { Id = Guid.NewGuid(), Sku = "X", Name = "X" };
        var tier = new PricingTier { Id = Guid.NewGuid(), Name = "T" };

        var exception = Assert.Throws<NoPriceException>(() => _sut.ResolvePrice(product, tier, [], [], 1));

        Assert.IsAssignableFrom<InvalidOperationException>(exception); // existing callers that catch the base type still work
    }
}
