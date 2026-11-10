using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// An address as the page sends it (MRV-9.3): registration (which ignores the type and flags: that address is the billing address and
/// the default delivery address), a new address, an edited one, or an admin's fix. <c>IsBilling</c> / <c>IsDefaultDelivery</c> ask to
/// MAKE this address the billing / default delivery one; sending false leaves things as they are, because there is always exactly one
/// billing address, so the way to move it is to choose another one.
/// </summary>
public record ClientAddressRequest(
    string? Label,
    ClientAddressKind? Kind,
    string? PostalCode,
    string? Street,
    string? Number,
    string? Complement,
    string? District,
    string? City,
    string? State,
    string? DeliveryNotes,
    bool IsBilling = false,
    bool IsDefaultDelivery = false)
{
    public ClientAddressInput ToInput() => new(Label, Kind, PostalCode, Street, Number, Complement, District, City, State, DeliveryNotes);
}
