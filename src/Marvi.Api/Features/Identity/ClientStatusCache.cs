using System.Collections.Concurrent;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

/// <summary>
/// What a suspended customer is told (MRV-9.9), by the sign-in and by every request that still carries their old token. The <c>code</c> is what the
/// SPA reads; the message is what a person reads.
/// </summary>
public static class AccountSuspension
{
    public const string Code = "account_suspended";
    public const string Message = "Sua conta está suspensa. Entre em contato com a empresa.";

    public static object Body => new { code = Code, message = Message };
}

/// <summary>
/// A customer's status as the API last read it (MRV-9.9), so a Suspended customer's token can be refused on every request without a database read each
/// time. An entry lives <see cref="Lifetime"/> at most, so a status change made by another process (a second replica) takes effect within 60 seconds; a change
/// made by this process calls <see cref="Invalidate"/> and takes effect at once. A single process only: with several replicas the other replicas keep
/// their entry until it expires (see docs/work-items/MRV-9.9/decisions.md).
/// </summary>
public class ClientStatusCache(TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(60);

    private const int MaxEntries = 10_000;

    private readonly ConcurrentDictionary<Guid, Entry> _entries = new();
    private long _generation;

    private readonly record struct Entry(ClientAccountStatus? Status, DateTimeOffset ExpiresAt);

    /// <summary>The customer's status, or null when no such account exists. Read from the database when the cached value is missing or older than <see cref="Lifetime"/>.</summary>
    public virtual async Task<ClientAccountStatus?> GetStatusAsync(Guid clientAccountId, AppDbContext dbContext, CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow();
        if (_entries.TryGetValue(clientAccountId, out var entry) && now < entry.ExpiresAt)
        {
            return entry.Status;
        }

        // An invalidation that lands while this read is in flight must not be undone by the stale value read before it.
        var generation = Interlocked.Read(ref _generation);
        ClientAccountStatus? status = await dbContext.ClientAccounts.AsNoTracking()
            .Where(c => c.Id == clientAccountId)
            .Select(c => (ClientAccountStatus?)c.Status)
            .FirstOrDefaultAsync(cancellationToken);

        if (Interlocked.Read(ref _generation) == generation)
        {
            if (_entries.Count >= MaxEntries)
            {
                Purge(now);
            }

            _entries[clientAccountId] = new Entry(status, now + Lifetime);
            // An invalidation between the check and the write: take the entry back out (the next request reads the database).
            if (Interlocked.Read(ref _generation) != generation)
            {
                _entries.TryRemove(clientAccountId, out _);
            }
        }

        return status;
    }

    /// <summary>Forgets what is known about one customer; the next request reads the database. Called after an admin approves or suspends them.</summary>
    public void Invalidate(Guid clientAccountId)
    {
        Interlocked.Increment(ref _generation);
        _entries.TryRemove(clientAccountId, out _);
    }

    private void Purge(DateTimeOffset now)
    {
        foreach (var pair in _entries)
        {
            if (now >= pair.Value.ExpiresAt)
            {
                _entries.TryRemove(pair.Key, out _);
            }
        }

        if (_entries.Count >= MaxEntries)
        {
            _entries.Clear();
        }
    }
}
