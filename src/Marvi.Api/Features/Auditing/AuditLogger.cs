using System.Text.Json;
using Marvi.Api.Features.Identity;
using Marvi.Domain.Auditing;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Auditing;

/// <summary>The audit vocabulary: one name per kind of admin change, shared by every admin controller.</summary>
public static class AuditActions
{
    public const string Create = "Create";
    public const string Update = "Update";
    public const string Delete = "Delete";
    public const string Upsert = "Upsert";
    public const string Approve = "Approve";
    public const string Suspend = "Suspend";
    public const string Import = "Import";
    /// <summary>An admin asked to see a personal identifier in full (a customer's CPF, MRV-9.4).</summary>
    public const string Reveal = "Reveal";
}

/// <summary>One row an admin change created or touched, as the audit trail records it.</summary>
public sealed record AuditedRow(string Action, string EntityName, Guid EntityId, object? Details = null);

/// <summary>
/// The only way an admin change is committed (MRV-4.4). The change a controller has already made to the tracked entities
/// and its audit entry are written in ONE save, so they succeed or fail together: there is no state where a change is
/// stored without its audit entry. Registered by AuditingModule; injected into every controller that mutates audited data.
/// </summary>
public class AuditLogger
{
    private readonly AppDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditLogger(AppDbContext dbContext, IHttpContextAccessor httpContextAccessor)
    {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
    }

    /// <summary>What a controller answers (409) when <see cref="TrySaveAsync"/> reports that the database refused the change.</summary>
    public const string ConflictMessage = "The data was changed by someone else, or something it refers to was just removed. Reload and try again.";

    // Private on purpose: an admin mutation must go through TrySaveAsync so a race is a 409, never a 500.
    private async Task SaveAsync(IEnumerable<AuditedRow> rows)
    {
        _dbContext.AuditLogEntries.AddRange(rows.Select(r => CreateEntry(r.Action, r.EntityName, r.EntityId, r.Details)));
        await _dbContext.SaveChangesAsync();
    }

    /// <summary>
    /// Saves the pending changes together with their audit entry in ONE save. A unique-index or foreign-key rejection (a race that passed the application-level
    /// check) returns false and saves nothing, so the caller answers 409. Other database failures still propagate.
    /// </summary>
    public Task<bool> TrySaveAsync(string action, string entityName, Guid entityId, object? details = null) =>
        TrySaveAsync(new[] { new AuditedRow(action, entityName, entityId, details) });

    /// <summary>
    /// The same for a change that creates several rows (a product with its prices and stock, MRV-9.5): one audit entry per row, all in the ONE save,
    /// so every row and every entry is stored or none is.
    /// </summary>
    public async Task<bool> TrySaveAsync(IReadOnlyCollection<AuditedRow> rows)
    {
        try
        {
            await SaveAsync(rows);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            // Someone else changed the same row first (for example another admin decided the same customer): nothing is saved.
            return false;
        }
        catch (DbUpdateException exception) when (exception.IsConstraintViolation())
        {
            return false;
        }
    }

    private AuditLogEntry CreateEntry(string action, string entityName, Guid entityId, object? details) => new()
    {
        Id = Guid.NewGuid(),
        ActorUserId = GetActorUserId(),
        Action = action,
        EntityName = entityName,
        EntityId = entityId,
        Timestamp = DateTime.UtcNow,
        Details = SerializeDetails(details)
    };

    private Guid GetActorUserId() => _httpContextAccessor.HttpContext?.User.UserId() ?? Guid.Empty;

    private static Dictionary<string, string> SerializeDetails(object? details)
    {
        if (details is null)
        {
            return new Dictionary<string, string>();
        }

        return new Dictionary<string, string> { ["data"] = JsonSerializer.Serialize(details) };
    }
}
