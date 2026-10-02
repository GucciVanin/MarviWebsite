namespace Marvi.Api.Features.Catalog.Contracts;

public record UpsertProductPricingRequest(Guid PricingTierId, decimal UnitPrice, int MinQty);
