namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>The pricing tier an admin moves a customer to (MRV-5.1). There is no credit limit: customers have no credit.</summary>
public record UpdateClientTierRequest(Guid PricingTierId);
