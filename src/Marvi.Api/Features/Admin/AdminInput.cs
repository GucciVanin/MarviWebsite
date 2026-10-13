using System.Linq.Expressions;

namespace Marvi.Api.Features.Admin;

/// <summary>
/// The admin input rules (MRV-4.6), defined once: how text is cleaned, when it counts as missing or too long, and how
/// "same name ignoring case" is asked of the database. Controllers keep their own limits and messages; they no longer
/// re-implement the mechanics.
/// </summary>
public static class AdminInput
{
    /// <summary>Text as stored: surrounding whitespace removed (null becomes empty).</summary>
    public static string Clean(string? value) => value?.Trim() ?? string.Empty;

    /// <summary>Missing: null, empty or whitespace only.</summary>
    public static bool IsBlank(string? value) => string.IsNullOrWhiteSpace(value);

    /// <summary>Over the limit once cleaned (the limit applies to the stored text, not to the padding around it).</summary>
    public static bool ExceedsLength(string? value, int maxLength) => Clean(value).Length > maxLength;

    /// <summary>
    /// A database filter for "<paramref name="property"/> equals <paramref name="value"/>, ignoring case". Kept as an
    /// expression so the database does the comparison (the unique indexes on these columns are case-insensitive too).
    /// </summary>
    public static Expression<Func<T, bool>> EqualsIgnoreCase<T>(Expression<Func<T, string>> property, string value)
    {
        var lowered = value.ToLower();
        Expression<Func<string>> loweredValue = () => lowered; // a closure member, so the database parameterizes it
        var toLower = typeof(string).GetMethod(nameof(string.ToLower), Type.EmptyTypes)!;
        var body = Expression.Equal(Expression.Call(property.Body, toLower), loweredValue.Body);
        return Expression.Lambda<Func<T, bool>>(body, property.Parameters);
    }
}

/// <summary>"This is still referenced, so it cannot be deleted": a check and the message that explains it.</summary>
public sealed record DeleteGuard(Func<Task<bool>> IsInUse, string Message);

public static class DeleteGuards
{
    /// <summary>The message of the first guard that is in use, or null when the delete is allowed. Guards run in order.</summary>
    public static async Task<string?> BlockingMessageAsync(params DeleteGuard[] guards)
    {
        foreach (var guard in guards)
        {
            if (await guard.IsInUse())
            {
                return guard.Message;
            }
        }

        return null;
    }
}
