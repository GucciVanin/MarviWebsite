namespace Marvi.Domain.Identity;

/// <summary>A customer's company details once they have passed <see cref="ClientProfileRules.Check"/>: the trimmed company name.</summary>
public sealed record ClientProfile(string CompanyName);

/// <summary>
/// The one definition of what a customer's company name may be (MRV-2.2), used when registering and when editing the profile.
/// The customer's addresses (MRV-9.3) have their own rules in <see cref="ClientAddressRules"/>.
/// </summary>
public static class ClientProfileRules
{
    public const int MaxCompanyNameLength = 200;

    public static (ClientProfile? Profile, string? Problem) Check(string? companyName)
    {
        var company = companyName?.Trim();
        if (string.IsNullOrWhiteSpace(company))
        {
            return (null, "Company name is required.");
        }

        if (company.Length > MaxCompanyNameLength)
        {
            return (null, $"Company name is limited to {MaxCompanyNameLength} characters.");
        }

        if (company.Any(char.IsControl))
        {
            // A NUL character cannot be stored.
            return (null, "Company name cannot contain control characters or line breaks.");
        }

        return (new ClientProfile(company), null);
    }
}
