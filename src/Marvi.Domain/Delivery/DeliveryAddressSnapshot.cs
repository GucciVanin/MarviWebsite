using Marvi.Domain.Identity;

namespace Marvi.Domain.Delivery;

/// <summary>
/// The delivery address a quote or an order carries (MRV-9.6): a copy of the structured fields of one of the customer's addresses as they were
/// when it was chosen, plus a nullable link to that address (<see cref="DeliveryAddressId"/>, cleared by the database if the address is
/// later removed). Editing or removing the customer's address never changes a document that already copied it. All fields are null on a
/// document made before this existed (a legacy order keeps its text in <c>Order.DeliveryAddress</c>).
/// </summary>
public interface IHasDeliveryAddress
{
    Guid? DeliveryAddressId { get; set; }
    string? DeliveryAddressLabel { get; set; }
    string? DeliveryAddressStreet { get; set; }
    string? DeliveryAddressNumber { get; set; }
    string? DeliveryAddressComplement { get; set; }
    string? DeliveryAddressDistrict { get; set; }
    string? DeliveryAddressCity { get; set; }
    string? DeliveryAddressState { get; set; }
    string? DeliveryAddressPostalCode { get; set; }
    string? DeliveryAddressNotes { get; set; }
}

public static class DeliveryAddressSnapshot
{
    /// <summary>True when the document carries a structured address.</summary>
    public static bool Has(this IHasDeliveryAddress document) => document.DeliveryAddressLabel is not null;

    /// <summary>Copies the fields of <paramref name="address"/> onto the document (the choice of an address, or its change).</summary>
    public static void CopyFrom(this IHasDeliveryAddress document, ClientAddress address)
    {
        document.DeliveryAddressId = address.Id;
        document.DeliveryAddressLabel = address.Label;
        document.DeliveryAddressStreet = address.Street;
        document.DeliveryAddressNumber = address.Number;
        document.DeliveryAddressComplement = address.Complement;
        document.DeliveryAddressDistrict = address.District;
        document.DeliveryAddressCity = address.City;
        document.DeliveryAddressState = address.State;
        document.DeliveryAddressPostalCode = address.PostalCode;
        document.DeliveryAddressNotes = address.DeliveryNotes;
    }

    /// <summary>Copies the snapshot of one document onto another (accepting a quote: the order gets the quote's address, as it was).</summary>
    public static void CopyFrom(this IHasDeliveryAddress document, IHasDeliveryAddress source)
    {
        document.DeliveryAddressId = source.DeliveryAddressId;
        document.DeliveryAddressLabel = source.DeliveryAddressLabel;
        document.DeliveryAddressStreet = source.DeliveryAddressStreet;
        document.DeliveryAddressNumber = source.DeliveryAddressNumber;
        document.DeliveryAddressComplement = source.DeliveryAddressComplement;
        document.DeliveryAddressDistrict = source.DeliveryAddressDistrict;
        document.DeliveryAddressCity = source.DeliveryAddressCity;
        document.DeliveryAddressState = source.DeliveryAddressState;
        document.DeliveryAddressPostalCode = source.DeliveryAddressPostalCode;
        document.DeliveryAddressNotes = source.DeliveryAddressNotes;
    }

    /// <summary>The one-line address cut to the length of the order's text column (a snapshot may hold long migrated text).</summary>
    public static string LineForText(this IHasDeliveryAddress document)
    {
        var line = document.Line();
        return line.Length <= Orders.Order.MaxDeliveryAddressLength ? line : line[..Orders.Order.MaxDeliveryAddressLength];
    }

    /// <summary>The address on one line, as a table cell or the old text column shows it: <c>Rua A, 10 - Sala 3, Centro, Campinas/SP, CEP 13010-000</c>. Empty parts are left out.</summary>
    public static string Line(this IHasDeliveryAddress document)
    {
        if (!document.Has())
        {
            return string.Empty;
        }

        var street = string.IsNullOrEmpty(document.DeliveryAddressNumber)
            ? document.DeliveryAddressStreet
            : $"{document.DeliveryAddressStreet}, {document.DeliveryAddressNumber}";
        if (!string.IsNullOrEmpty(document.DeliveryAddressComplement))
        {
            street += $" - {document.DeliveryAddressComplement}";
        }

        var cityState = string.Join('/', new[] { document.DeliveryAddressCity, document.DeliveryAddressState }.Where(p => !string.IsNullOrEmpty(p)));
        var code = document.DeliveryAddressPostalCode;
        var postal = string.IsNullOrEmpty(code) ? null : code.Length == 8 && code.All(char.IsDigit) ? $"CEP {code[..5]}-{code[5..]}" : $"CEP {code}";
        return string.Join(", ", new[] { street, document.DeliveryAddressDistrict, cityState, postal }.Where(p => !string.IsNullOrEmpty(p)));
    }
}
