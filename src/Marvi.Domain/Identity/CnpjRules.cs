namespace Marvi.Domain.Identity;

/// <summary>
/// The one definition of a CNPJ (MRV-9.4): 14 characters = 8 of the company root + 4 of the establishment order (0001 is the head office,
/// "matriz"; anything else a branch, "filial") + 2 check digits. Since July 2026 the Receita Federal also issues alphanumeric numbers: the
/// first 12 characters may be digits or the letters A-Z, the two check digits are always digits. Both kinds are checked by módulo 11 over
/// each character's ASCII code minus 48 (digits keep their value, "A" is 17). Source and worked example: docs/work-items/MRV-9.4/decisions.md.
/// </summary>
public static class CnpjRules
{
    public const int Length = 14;
    private static readonly int[] FirstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    private static readonly int[] SecondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    /// <summary>Drops the punctuation people type (<c>. / -</c> and spaces) and upper-cases; null stays null.</summary>
    public static string? Normalize(string? text)
    {
        if (text is null)
        {
            return null;
        }

        // Upper-case the ASCII letters only: ToUpperInvariant would turn look-alikes such as U+017F (long s) into a plain S and let them in.
        return new string(text.Where(c => c is not ('.' or '/' or '-') && !char.IsWhiteSpace(c)).Select(c => char.IsAsciiLetterLower(c) ? char.ToUpperInvariant(c) : c).ToArray());
    }

    /// <summary>The check digits of the first 12 characters (digits or A-Z), or null when they are not 12 such characters.</summary>
    public static string? CheckDigits(string? first12)
    {
        if (first12 is null || first12.Length != 12 || !first12.All(IsBodyCharacter))
        {
            return null;
        }

        var one = Digit(first12, FirstWeights);
        var two = Digit(first12 + one, SecondWeights);
        return $"{one}{two}";
    }

    /// <summary>True for a normalized CNPJ: 14 characters, body in 0-9/A-Z, numeric check digits that match, not one repeated character.</summary>
    public static bool IsValid(string? normalized) =>
        normalized is { Length: Length }
        && normalized.Take(12).All(IsBodyCharacter)
        && normalized.Skip(12).All(char.IsAsciiDigit)
        && normalized.Distinct().Count() > 1
        && CheckDigits(normalized[..12]) == normalized[12..];

    /// <summary>"Matriz" when the establishment order is 0001, otherwise "Filial".</summary>
    public static bool IsHeadOffice(string normalized) => normalized.Length == Length && normalized.Substring(8, 4) == "0001";

    /// <summary>Formats a normalized CNPJ as <c>AA.AAA.AAA/AAAA-DD</c>.</summary>
    public static string Format(string normalized) =>
        normalized.Length == Length ? $"{normalized[..2]}.{normalized[2..5]}.{normalized[5..8]}/{normalized[8..12]}-{normalized[12..]}" : normalized;

    private static bool IsBodyCharacter(char c) => char.IsAsciiDigit(c) || char.IsAsciiLetterUpper(c);

    private static int Digit(string characters, int[] weights)
    {
        var sum = 0;
        for (var i = 0; i < weights.Length; i++)
        {
            sum += (characters[i] - 48) * weights[i];
        }

        var remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    }
}
