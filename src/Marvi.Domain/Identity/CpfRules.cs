namespace Marvi.Domain.Identity;

/// <summary>
/// The one definition of a CPF (MRV-9.4): 11 digits = 9 base digits + 2 check digits (módulo 11, weights 10..2 then 11..2); a number made of
/// one repeated digit passes the arithmetic but is never issued, so it is refused. A CPF is personal data (LGPD): <see cref="Mask"/> is the
/// only form staff screens, logs and the audit trail may show.
/// </summary>
public static class CpfRules
{
    public const int Length = 11;

    /// <summary>Drops the punctuation people type (<c>. -</c> and spaces); null stays null.</summary>
    public static string? Normalize(string? text) =>
        text is null ? null : new string(text.Where(c => c is not ('.' or '-') && !char.IsWhiteSpace(c)).ToArray());

    public static bool IsValid(string? normalized)
    {
        if (normalized is not { Length: Length } || !normalized.All(char.IsAsciiDigit) || normalized.Distinct().Count() == 1)
        {
            return false;
        }

        var one = Digit(normalized, 9);
        var two = Digit(normalized, 10);
        return normalized[9] - '0' == one && normalized[10] - '0' == two;
    }

    /// <summary>Formats a normalized CPF as <c>000.000.000-00</c>.</summary>
    public static string Format(string normalized) =>
        normalized.Length == Length ? $"{normalized[..3]}.{normalized[3..6]}.{normalized[6..9]}-{normalized[9..]}" : normalized;

    /// <summary>The form shown to staff: <c>***.456.789-**</c> (only the middle six digits).</summary>
    public static string Mask(string normalized) =>
        normalized.Length == Length ? $"***.{normalized[3..6]}.{normalized[6..9]}-**" : "***.***.***-**";

    private static int Digit(string cpf, int count)
    {
        var sum = 0;
        for (var i = 0; i < count; i++)
        {
            sum += (cpf[i] - '0') * (count + 1 - i);
        }

        var remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    }
}
