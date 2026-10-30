using System.Text.Json.Serialization;

namespace Marvi.Domain.Identity;

/// <summary>What an address may be used for (MRV-9.3): invoicing, receiving goods, or both.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ClientAddressKind
{
    Billing = 0,
    Delivery = 1,
    Both = 2
}

/// <summary>
/// One of a customer's named addresses in the Brazilian structure (MRV-9.3). <c>Id</c> never leaves the server; the page and the API
/// calls use <c>Key</c>, an opaque value that is only meaningful together with the signed-in customer (or, for staff, the customer's id),
/// so an address of another customer cannot be reached with it.
/// </summary>
public class ClientAddress
{
    public Guid Id { get; set; }
    public Guid Key { get; set; }
    public Guid ClientAccountId { get; set; }
    public ClientAccount? ClientAccount { get; set; }

    /// <summary>The nickname the customer gives it ("Matriz", "Filial Campinas").</summary>
    public string Label { get; set; } = string.Empty;
    public ClientAddressKind Kind { get; set; }
    /// <summary>The CEP: exactly 8 digits, stored without the dash. Empty only on a legacy row that still needs review.</summary>
    public string PostalCode { get; set; } = string.Empty;
    public string Street { get; set; } = string.Empty;
    public string Number { get; set; } = string.Empty;
    public string? Complement { get; set; }
    public string District { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    /// <summary>The UF (two letters).</summary>
    public string State { get; set; } = string.Empty;
    /// <summary>Always <c>BR</c> for now.</summary>
    public string Country { get; set; } = ClientAddressRules.CountryBrazil;
    public string? DeliveryNotes { get; set; }
    /// <summary>The one address invoices go to. At most one per customer (a unique index backs that up).</summary>
    public bool IsBilling { get; set; }
    /// <summary>The one default delivery address. At most one per customer.</summary>
    public bool IsDefault { get; set; }
    /// <summary>True on a row the migration made from the old free-text address: the customer is asked to complete it.</summary>
    public bool NeedsReview { get; set; }
    public DateTime CreatedAt { get; set; }
}
