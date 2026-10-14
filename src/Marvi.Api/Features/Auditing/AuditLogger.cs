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
}

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
    private async Task SaveAsync(string action, string entityName, Guid entityId, object? details = null)
    {
        _dbContext.AuditLogEntries.Add(CreateEntry(action, entityName, entityId, details));
        await _dbContext.SaveChangesAsync();
    }

    /// <summary>
    /// Saves the pending changes together with their audit entry in ONE save. A unique-index or foreign-key rejection (a race that passed the application-level
    /// check) returns false and saves nothing, so the caller answers 409. Other database failures still propagate.
    /// </summary>
    public async Task<bool> TrySaveAsync(string action, string entityName, Guid entityId, object? details = null)
    {
        try
        {
            await SaveAsync(action, entityName, entityId, details);
            return true;
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
