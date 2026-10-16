namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>Approving a customer is the admin's explicit choice of their pricing tier: nobody is approved by default.</summary>
public record ApproveClientRequest(Guid PricingTierId);
