using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>One line of the customer directory (MRV-2.4b.1): enough to recognise a customer and open them.</summary>
public record ClientSummaryDto(Guid Id, string CompanyName, ClientAccountStatus Status, string? PricingTierName, decimal CreditLimit);
