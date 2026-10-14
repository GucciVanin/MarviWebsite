using Marvi.Domain.Auditing;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Marvi.Tests.Support;

/// <summary>A test host whose database refuses any save that includes an audit entry, once <see cref="FailAuditWrites"/> is set.</summary>
public class FailingAuditFactory : MarviApiFactory
{
    public bool FailAuditWrites { get; set; }

    protected override void ConfigureDb(DbContextOptionsBuilder options) =>
        options.AddInterceptors(new RefuseAuditEntries(this));

    private sealed class RefuseAuditEntries(FailingAuditFactory factory) : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (factory.FailAuditWrites && eventData.Context!.ChangeTracker.Entries<AuditLogEntry>().Any(e => e.State == EntityState.Added))
            {
                throw new InvalidOperationException("Simulated audit write failure.");
            }

            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }
}
