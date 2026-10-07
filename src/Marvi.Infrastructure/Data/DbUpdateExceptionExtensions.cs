using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Marvi.Infrastructure.Data;

public static class DbUpdateExceptionExtensions
{
    private const string UniqueViolation = "23505";
    private const string ForeignKeyViolation = "23503";

    /// <summary>
    /// True when the save failed because a unique index or foreign key rejected it (for example two concurrent
    /// requests that both passed an application-level check). Anything else, such as a timeout or a dropped
    /// connection, is not a conflict and should not be reported as one.
    /// </summary>
    public static bool IsConstraintViolation(this DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: UniqueViolation or ForeignKeyViolation };
}
