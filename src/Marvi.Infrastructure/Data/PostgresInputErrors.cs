using Npgsql;

namespace Marvi.Infrastructure.Data;

public static class PostgresInputErrors
{
    // 22021 character_not_in_repertoire (for example a NUL character, which text columns cannot hold),
    // 22P05 untranslatable_character.
    private static readonly string[] InvalidTextStates = ["22021", "22P05"];

    /// <summary>True when the exception, or anything it wraps, is Postgres rejecting characters it cannot store.</summary>
    public static bool IsInvalidText(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres && InvalidTextStates.Contains(postgres.SqlState))
            {
                return true;
            }
        }

        return false;
    }
}
