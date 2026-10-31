using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// What a customer may change about themselves (MRV-2.2, MRV-9.4): the display name, the account type and the registration data. Addresses have their
/// own endpoints (MRV-9.3). Without <c>Registration</c> the stored data is left alone. After approval the verified record is locked (403 on any change to it).
/// </summary>
public record UpdateClientProfileRequest(string CompanyName, AccountType? AccountType = null, RegistrationRequest? Registration = null);

/// <summary>An admin's edit of a customer's registration record (MRV-9.4). Changing the account type needs <c>ConfirmTypeChange</c>, because the other type's fields are cleared.</summary>
public record AdminRegistrationRequest(string CompanyName, AccountType AccountType, RegistrationRequest? Registration, bool ConfirmTypeChange = false);
