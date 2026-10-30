using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>A customer's own company details (MRV-2.2). Credit and pricing tier are the admin's business, so they are not here. `CustomerNumber` is the number the customer can quote to staff (MRV-9.1).</summary>
public record ClientOwnProfileDto(Guid Id, int CustomerNumber, string CompanyName, string BillingAddress, List<string> ShippingAddresses, ClientAccountStatus Status, DateTime CreatedAt);
