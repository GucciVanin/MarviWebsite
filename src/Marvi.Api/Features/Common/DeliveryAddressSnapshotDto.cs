using Marvi.Domain.Delivery;

namespace Marvi.Api.Features.Common;

/// <summary>
/// The delivery address a quote or an order carries (MRV-9.6), as it was when it was chosen. It has no key and no id: it is a copy, not a
/// reference, so the page can show it but not use it to reach the customer's address. <c>Line</c> is the same address on one line.
/// The text is the customer's own free text, so a page must escape it (Angular does) and any PDF, e-mail or CSV built from it must too.
/// </summary>
public record DeliveryAddressSnapshotDto(
    string Label,
    string PostalCode,
    string Street,
    string Number,
    string? Complement,
    string District,
    string City,
    string State,
    string? Notes,
    string Line)
{
    /// <summary>The snapshot of a document, or null when it has none (a document from before MRV-9.6).</summary>
    public static DeliveryAddressSnapshotDto? From(IHasDeliveryAddress document) => document.Has()
        ? new DeliveryAddressSnapshotDto(
            document.DeliveryAddressLabel ?? string.Empty,
            document.DeliveryAddressPostalCode ?? string.Empty,
            document.DeliveryAddressStreet ?? string.Empty,
            document.DeliveryAddressNumber ?? string.Empty,
            document.DeliveryAddressComplement,
            document.DeliveryAddressDistrict ?? string.Empty,
            document.DeliveryAddressCity ?? string.Empty,
            document.DeliveryAddressState ?? string.Empty,
            document.DeliveryAddressNotes,
            document.Line())
        : null;
}
