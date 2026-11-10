using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// Registration (MRV-9.3, MRV-9.4): the display name (company name, or full name for a personal account), the billing address in the structured form (it becomes
/// the customer's first address) and the account type with its registration data. A request without an account type is a business account (the page always sends one).
/// </summary>
public record RegisterRequest(
    string Email,
    string Password,
    string CompanyName,
    ClientAddressRequest BillingAddress,
    AccountType? AccountType = null,
    RegistrationRequest? Registration = null);
