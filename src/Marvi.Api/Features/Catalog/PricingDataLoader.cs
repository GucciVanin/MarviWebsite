using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

/// <summary>Loads what <see cref="BasketPricingService"/> needs: the requested products, the tier's prices and the running Deals.</summary>
public class PricingDataLoader
{
    private readonly AppDbContext _dbContext;

    public PricingDataLoader(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PricingData> LoadAsync(PricingTier? tier, IReadOnlyCollection<Guid> productIds)
    {
        if (tier is null)
        {
            return new PricingData(null, new Dictionary<Guid, Product>(), [], []);
        }

        var products = await _dbContext.Products.Where(p => productIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var pricingRows = await _dbContext.ProductPricings.Where(pp => pp.PricingTierId == tier.Id).ToListAsync();
        var deals = await _dbContext.Deals.Where(Deal.ActiveAt(DateTime.UtcNow)).ToListAsync();
        return new PricingData(tier, products, pricingRows, deals);
    }
}
