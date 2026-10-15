namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>The customer's credit limit and pricing tier after an admin adjusts them (MRV-1.3). The account status is not part of it.</summary>
public record UpdateClientCreditRequest(Guid PricingTierId, decimal CreditLimit);
