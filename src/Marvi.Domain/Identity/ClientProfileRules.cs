namespace Marvi.Domain.Identity;

/// <summary>A customer's company details once they have passed <see cref="ClientProfileRules.Check"/>: trimmed, within limits, addresses without blanks or repeats.</summary>
public sealed record ClientProfile(string CompanyName, string BillingAddress, IReadOnlyList<string> ShippingAddresses);

/// <summary>
/// The one definition of what a customer's company name, billing address and shipping addresses may be (MRV-2.2), used when
/// registering and when editing the profile. Blank shipping lines and repeats (ignoring case) are dropped rather than refused,
/// so a pasted list of addresses is forgiven; the messages for the required and length rules are the registration's.
/// </summary>
public static class ClientProfileRules
{
    public const int MaxCompanyNameLength = 200;
    public const int MaxAddressLength = 500;
    public const int MaxShippingAddresses = 10;

    public static (ClientProfile? Profile, string? Problem) Check(string? companyName, string? billingAddress, IEnumerable<string?>? shippingAddresses = null)
    {
        var company = companyName?.Trim();
        var billing = billingAddress?.Trim();
        if (string.IsNullOrWhiteSpace(company) || string.IsNullOrWhiteSpace(billing))
        {
            return (null, "Company name and billing address are required.");
        }

        if (company.Length > MaxCompanyNameLength || billing.Length > MaxAddressLength)
        {
            return (null, $"Company name is limited to {MaxCompanyNameLength} characters and the address to {MaxAddressLength}.");
        }

        var shippingInput = (shippingAddresses ?? []).Select(a => a?.Trim() ?? string.Empty).ToList();
        if (new[] { company, billing }.Concat(shippingInput).Any(text => text.Any(char.IsControl)))
        {
            // A NUL character cannot be stored, and a line break inside an address would be split in two by the one-address-per-line form.
            return (null, "Company name and addresses cannot contain control characters or line breaks.");
        }

        var shipping = shippingInput
            .Where(a => a.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (shipping.Any(a => a.Length > MaxAddressLength))
        {
            return (null, $"Each shipping address is limited to {MaxAddressLength} characters.");
        }

        if (shipping.Count > MaxShippingAddresses)
        {
            return (null, $"At most {MaxShippingAddresses} shipping addresses are allowed.");
        }

        return (new ClientProfile(company, billing, shipping), null);
    }
}
