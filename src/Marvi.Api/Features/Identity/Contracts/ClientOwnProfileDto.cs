using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// A customer's own company details (MRV-2.2). Credit and pricing tier are the admin's business, so they are not here. `CustomerNumber` is the
/// number the customer can quote to staff (MRV-9.1). `Registration` is their registration data (MRV-9.4, CPF masked); `RegistrationLocked` is true once approved: only an admin changes the verified record. `Addresses` carry opaque keys (MRV-9.3); `BillingAddressKey` and `DefaultDeliveryKey` say which two are chosen.
/// </summary>
public record ClientOwnProfileDto(
    Guid Id,
    int CustomerNumber,
    string CompanyName,
    List<ClientAddressDto> Addresses,
    Guid? BillingAddressKey,
    Guid? DefaultDeliveryKey,
    ClientAccountStatus Status,
    DateTime CreatedAt,
    RegistrationDto? Registration = null,
    bool RegistrationLocked = false);
