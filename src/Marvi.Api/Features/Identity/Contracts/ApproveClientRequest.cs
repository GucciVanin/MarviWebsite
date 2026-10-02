namespace Marvi.Api.Features.Identity.Contracts;

public record ApproveClientRequest(Guid PricingTierId, decimal CreditLimit);
