using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

/// <summary>What choosing a delivery address answered: the customer's address, or the HTTP status (400 or 404) and the reason.</summary>
public sealed record DeliveryAddressOutcome(ClientAddress? Address, int Status = 200, string? Message = null)
{
    public bool Succeeded => Address is not null;
}

/// <summary>
/// The one place a delivery address is chosen for a quote or an order (MRV-9.6). An address is always looked up by its key AND the owning
/// customer, so a key of another customer, or an unknown one, answers 404 and never reveals which. Without a key the customer's default
/// delivery address is used. Only an address that can receive goods (type Delivery or Both) can be chosen.
/// </summary>
public static class DeliveryAddressChoice
{
    public const string RegisterOne = "Cadastre um endereço de entrega.";
    public const string ChooseOne = "Escolha o endereço de entrega.";
    public const string BillingOnly = "Este endereço é só de cobrança. Escolha um endereço de entrega.";

    /// <param name="key">The address the customer chose, or null for the default delivery address.</param>
    public static async Task<DeliveryAddressOutcome> ResolveAsync(AppDbContext dbContext, Guid accountId, Guid? key)
    {
        if (key is { } chosen)
        {
            var address = await dbContext.ClientAddresses.FirstOrDefaultAsync(a => a.Key == chosen && a.ClientAccountId == accountId);
            if (address is null)
            {
                return new DeliveryAddressOutcome(null, 404);
            }

            return ClientAddressRules.CanDeliver(address.Kind)
                ? new DeliveryAddressOutcome(address)
                : new DeliveryAddressOutcome(null, 400, BillingOnly);
        }

        var capable = await dbContext.ClientAddresses
            .Where(a => a.ClientAccountId == accountId && (a.Kind == ClientAddressKind.Delivery || a.Kind == ClientAddressKind.Both))
            .ToListAsync();
        if (capable.Count == 0)
        {
            return new DeliveryAddressOutcome(null, 400, RegisterOne);
        }

        // A customer migrated from the old text may have no default flagged: the only candidate is used, otherwise they must choose.
        var fallback = capable.FirstOrDefault(a => a.IsDefault) ?? (capable.Count == 1 ? capable[0] : null);
        return fallback is null
            ? new DeliveryAddressOutcome(null, 400, ChooseOne)
            : new DeliveryAddressOutcome(fallback);
    }
}
