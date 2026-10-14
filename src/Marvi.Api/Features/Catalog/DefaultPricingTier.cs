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

    public const string CannotUnsetMessage = "A default tier is required. Make another tier the default instead.";

    /// <summary>The first tier ever created is always the default, whatever the request says.</summary>
    public static async Task<bool> ShouldBeDefaultAsync(AppDbContext dbContext, bool requested) =>
        requested || !await dbContext.PricingTiers.AnyAsync(t => t.IsDefault);

    /// <summary>
    /// Makes <paramref name="tier"/> the one default: the current default is un-flagged and flushed first so the unique
    /// "single default" index is never violated, then the tier is flagged (saved with the caller's own save).
    /// </summary>
    /// <summary>
    /// Applies what an update asks of the default flag: the one default cannot be unset (returns the message to answer with),
    /// and asking a non-default tier to be the default switches the default to it. Returns null when the request is fine.
    /// </summary>
    public static async Task<string?> ApplyRequestedDefaultAsync(AppDbContext dbContext, PricingTier tier, bool requested)
    {
        if (tier.IsDefault && !requested)
        {
            return CannotUnsetMessage;
        }

        if (requested && !tier.IsDefault)
        {
            await MakeDefaultAsync(dbContext, tier);
        }

        return null;
    }

    public static async Task MakeDefaultAsync(AppDbContext dbContext, PricingTier tier)
    {
        var current = await dbContext.PricingTiers.Where(t => t.IsDefault).ToListAsync();
        foreach (var existing in current)
        {
            existing.IsDefault = false;
        }

        await dbContext.SaveChangesAsync();
        tier.IsDefault = true;
    }
}
