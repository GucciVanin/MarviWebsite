using System.Net.Mail;

namespace Marvi.Api.Features.Identity;

public static class EmailAddressValidator
{
    /// <summary>
    /// ASP.NET Identity accepts any user name made of allowed characters ("not-an-email" is one), so the format is
    /// checked here. The parsed address must equal the input, which rejects display-name forms such as
    /// "Name &lt;a@b.com&gt;" and trailing junk.
    /// </summary>
    public static bool IsValid(string? email) =>
        !string.IsNullOrWhiteSpace(email)
        && email.Length <= 254
        && MailAddress.TryCreate(email, out var parsed)
        && parsed.Address == email
        && parsed.Host.Contains('.');
}
