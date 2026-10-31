using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>One line of the customer directory (MRV-2.4b.1): enough to recognise a customer, open them and (for an admin) change their tier. The tier id is here because tier names are not unique.</summary>
public record ClientSummaryDto(Guid Id, int CustomerNumber, string CompanyName, ClientAccountStatus Status, Guid? PricingTierId, string? PricingTierName, DateTime CreatedAt, AccountType AccountType = AccountType.Business);
