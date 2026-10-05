using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Marvi.Tests.Support;

public class DbUpdateExceptionExtensionsTests
{
    private static DbUpdateException Wrap(Exception? inner) => new("save failed", inner);

    [Theory]
    [InlineData("23505")] // unique_violation
    [InlineData("23503")] // foreign_key_violation
    public void IsConstraintViolation_IsTrue_ForUniqueAndForeignKeyViolations(string sqlState)
    {
        var postgres = new PostgresException("boom", "ERROR", "ERROR", sqlState);
        Assert.True(Wrap(postgres).IsConstraintViolation());
    }

    [Theory]
    [InlineData("40001")] // serialization_failure
    [InlineData("57014")] // query_canceled (timeout)
    [InlineData("08006")] // connection_failure
    public void IsConstraintViolation_IsFalse_ForOtherDatabaseErrors(string sqlState)
    {
        var postgres = new PostgresException("boom", "ERROR", "ERROR", sqlState);
        Assert.False(Wrap(postgres).IsConstraintViolation());
    }

    [Fact]
    public void IsConstraintViolation_IsFalse_WhenThereIsNoPostgresCause()
    {
        Assert.False(Wrap(null).IsConstraintViolation());
        Assert.False(Wrap(new TimeoutException()).IsConstraintViolation());
    }
}
