namespace Marvi.Api.Features.Catalog.Contracts;

public record ProductPricingDto(Guid PricingTierId, string PricingTierName, decimal UnitPrice, int MinQty);
