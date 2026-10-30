using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// One address of a customer (MRV-9.3). <c>Key</c> is the opaque handle used in API calls and never shown on a page; the database id never
/// leaves the server. <c>PostalCode</c> is the 8 digits (the page formats it as 00000-000). <c>NeedsReview</c> marks an address the
/// migration made from the old free text, which the customer is asked to complete.
/// </summary>
public record ClientAddressDto(
    Guid Key,
    string Label,
    ClientAddressKind Kind,
    string PostalCode,
    string Street,
    string Number,
    string? Complement,
    string District,
    string City,
    string State,
    string Country,
    string? DeliveryNotes,
    bool IsBilling,
    bool IsDefaultDelivery,
    bool NeedsReview)
{
    public static ClientAddressDto From(ClientAddress a) => new(
        a.Key, a.Label, a.Kind, a.PostalCode, a.Street, a.Number, a.Complement, a.District, a.City, a.State, a.Country, a.DeliveryNotes,
        a.IsBilling, a.IsDefault, a.NeedsReview);

    /// <summary>The addresses in the order a page lists them: billing first, then the default delivery address, then by label.</summary>
    public static List<ClientAddressDto> ListOf(IEnumerable<ClientAddress> addresses) => addresses
        .OrderByDescending(a => a.IsBilling).ThenByDescending(a => a.IsDefault).ThenBy(a => a.Label.ToLower()).ThenBy(a => a.CreatedAt).ThenBy(a => a.Id)
        .Select(From)
        .ToList();
}
