using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>A customer's own company details (MRV-2.2). Credit and pricing tier are the admin's business, so they are not here.</summary>
public record ClientOwnProfileDto(Guid Id, string CompanyName, string BillingAddress, List<string> ShippingAddresses, ClientAccountStatus Status, DateTime CreatedAt);
