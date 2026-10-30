using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// A customer as staff see them. <c>ContactEmail</c> (MRV-9.2) is the customer's login e-mail; only the Employee and Admin endpoints that
/// return this DTO expose it, never a customer-facing one.
/// </summary>
public record ClientProfileDto(
    Guid Id,
    int CustomerNumber,
    string CompanyName,
    DateTime CreatedAt,
    string BillingAddress,
    List<string> ShippingAddresses,
    string? PricingTierName,
    ClientAccountStatus Status,
    List<QuoteDto> Quotes,
    List<OrderDto> Orders,
    string? ContactEmail = null);
