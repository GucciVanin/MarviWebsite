using System.Globalization;
using System.Text;

namespace Marvi.Domain.Identity;

/// <summary>An address as it arrives (registration, profile, admin fix), before <see cref="ClientAddressRules.Check"/>.</summary>
public sealed record ClientAddressInput(
    string? Label,
    ClientAddressKind? Kind,
    string? PostalCode,
    string? Street,
    string? Number,
    string? Complement,
    string? District,
    string? City,
    string? State,
    string? DeliveryNotes);

/// <summary>An address that has passed <see cref="ClientAddressRules.Check"/>: trimmed, CEP as 8 digits, UF upper-case.</summary>
public sealed record ClientAddressData(
    string Label,
    ClientAddressKind Kind,
    string PostalCode,
    string Street,
    string Number,
    string? Complement,
    string District,
    string City,
    string State,
    string? DeliveryNotes);

/// <summary>
/// The one definition of what a customer's address may be (MRV-9.3), used by registration, the customer's profile and the admin's fix.
/// Structural checks only: required parts, lengths, CEP of 8 digits, a real UF, no control characters. There is no CEP web lookup.
/// </summary>
public static class ClientAddressRules
{
    public const string CountryBrazil = "BR";
    public const int MaxAddresses = 20;
    public const int MaxLabelLength = 60;
    public const int MaxStreetLength = 200;
    public const int MaxNumberLength = 20;
    public const int MaxComplementLength = 100;
    public const int MaxDistrictLength = 100;
    public const int MaxCityLength = 100;
    public const int MaxNotesLength = 300;
    public const string DefaultLabel = "Endereço principal";

    /// <summary>The 27 federative units (26 states and the Federal District).</summary>
    public static readonly IReadOnlyList<string> States =
    [
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
    ];

    public static bool CanBill(ClientAddressKind kind) => kind is ClientAddressKind.Billing or ClientAddressKind.Both;

    public static bool CanDeliver(ClientAddressKind kind) => kind is ClientAddressKind.Delivery or ClientAddressKind.Both;

    /// <param name="defaultLabel">The label to use when none is given (registration, which has no label field). Without it the label is required.</param>
    /// <param name="defaultKind">The kind to use when none is given.</param>
    public static (ClientAddressData? Address, string? Problem) Check(ClientAddressInput? input, string? defaultLabel = null, ClientAddressKind? defaultKind = null)
    {
        if (input is null)
        {
            return (null, "An address is required.");
        }

        if (new[] { input.Label, input.PostalCode, input.Street, input.Number, input.Complement, input.District, input.City, input.State, input.DeliveryNotes }
            .Any(text => text is not null && text.Any(IsForbidden)))
        {
            return (null, "Addresses cannot contain control characters or line breaks.");
        }

        var label = Clean(input.Label) ?? defaultLabel;
        var kind = input.Kind ?? defaultKind;
        var street = Clean(input.Street);
        var number = Clean(input.Number);
        var district = Clean(input.District);
        var city = Clean(input.City);
        var state = Clean(input.State)?.ToUpperInvariant();
        var postalCode = Clean(input.PostalCode)?.Replace("-", string.Empty).Replace(" ", string.Empty);
        var complement = Clean(input.Complement);
        var notes = Clean(input.DeliveryNotes);

        if (label is null || kind is null || street is null || number is null || district is null || city is null || state is null || string.IsNullOrEmpty(postalCode))
        {
            return (null, "Label, type, postal code, street, number, district, city and state are required.");
        }

        if (!Enum.IsDefined(kind.Value))
        {
            return (null, "Unknown address type.");
        }

        if (postalCode.Length != 8 || !postalCode.All(char.IsAsciiDigit))
        {
            return (null, "The postal code (CEP) must have 8 digits.");
        }

        if (!States.Contains(state))
        {
            return (null, "Unknown state (UF).");
        }

        if (label.Length > MaxLabelLength || street.Length > MaxStreetLength || number.Length > MaxNumberLength || (complement?.Length ?? 0) > MaxComplementLength
            || district.Length > MaxDistrictLength || city.Length > MaxCityLength || (notes?.Length ?? 0) > MaxNotesLength)
        {
            return (null, $"Lengths: label {MaxLabelLength}, street {MaxStreetLength}, number {MaxNumberLength}, complement {MaxComplementLength}, district {MaxDistrictLength}, city {MaxCityLength}, notes {MaxNotesLength}.");
        }

        return (new ClientAddressData(label, kind.Value, postalCode, street, number, complement, district, city, state, notes), null);
    }

    /// <summary>True when both are the same place: same CEP, number and complement, ignoring case and accents.</summary>
    public static bool IsSamePlace(ClientAddressData address, ClientAddress other) =>
        address.PostalCode == other.PostalCode
        && Fold(address.Number) == Fold(other.Number)
        && Fold(address.Complement ?? string.Empty) == Fold(other.Complement ?? string.Empty);

    /// <summary>Lower case without accents or surrounding spaces, so "Sala 2" and "SALA 2 " and "sálá 2" are one.</summary>
    public static string Fold(string text)
    {
        var decomposed = text.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(character);
            }
        }

        return builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
    }

    /// <summary>Control characters, line and paragraph separators and invisible format characters (zero-width, bidi) have no place in an address.</summary>
    private static bool IsForbidden(char c) =>
        char.IsControl(c) || CharUnicodeInfo.GetUnicodeCategory(c) is UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator or UnicodeCategory.Format;

    private static string? Clean(string? text)
    {
        var trimmed = text?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
