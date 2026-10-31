namespace Marvi.Api.Features.Identity;

/// <summary>Reads the customer number in a by-number route (MRV-9.1).</summary>
public static class CustomerNumbers
{
    public const string NotANumber = "The customer number must be digits only.";

    /// <summary>
    /// False when the text is not digits (a 400). Digits that do not fit a number, or that are zero, parse to a number no customer has
    /// (a 404), so "unknown" and "not a number" stay distinct.
    /// </summary>
    public static bool TryParse(string? text, out int number)
    {
        number = 0;
        if (string.IsNullOrEmpty(text) || !text.All(char.IsAsciiDigit))
        {
            return false;
        }

        if (!int.TryParse(text, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out number))
        {
            number = 0;
        }

        return true;
    }
}
