using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

public record ClientProfileDto(
    Guid Id,
    string CompanyName,
    string BillingAddress,
    List<string> ShippingAddresses,
    decimal CreditLimit,
    string? PricingTierName,
    ClientAccountStatus Status,
    List<QuoteDto> Quotes,
    List<OrderDto> Orders);
