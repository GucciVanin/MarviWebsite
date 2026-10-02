using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

/// <summary>
/// Resolves the pricing tier used for anonymous visitors and new clients. Exactly one tier is flagged
/// <see cref="PricingTier.IsDefault"/>; <see cref="GetOrCreateAsync"/> guarantees one exists.
/// </summary>
public static class DefaultPricingTier
{
    public const string DefaultName = "Standard";

    public static async Task<PricingTier?> FindAsync(AppDbContext dbContext)
    {
        return await dbContext.PricingTiers.FirstOrDefaultAsync(t => t.IsDefault)
            ?? await dbContext.PricingTiers.OrderBy(t => t.Name).FirstOrDefaultAsync();
    }

    public static async Task<PricingTier> GetOrCreateAsync(AppDbContext dbContext)
    {
        var tier = await FindAsync(dbContext);
        if (tier is null)
        {
            tier = new PricingTier { Id = Guid.NewGuid(), Name = DefaultName, IsDefault = true };
            dbContext.PricingTiers.Add(tier);
            await dbContext.SaveChangesAsync();
        }
        else if (!tier.IsDefault)
        {
            // Data created before the flag existed: promote the fallback tier so the choice becomes deliberate.
            tier.IsDefault = true;
            await dbContext.SaveChangesAsync();
        }

        return tier;
    }
}
