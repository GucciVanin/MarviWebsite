using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Marvi.Domain.Auditing;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Http;

namespace Marvi.Api.Features.Auditing;

// Scoped service registered by AuditingModule; injected into every controller that mutates audited data.
public class AuditLogger
{
    private readonly AppDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditLogger(AppDbContext dbContext, IHttpContextAccessor httpContextAccessor)
    {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task LogAsync(string action, string entityName, Guid entityId, object? details = null)
    {
        var entry = new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            ActorUserId = GetActorUserId(),
            Action = action,
            EntityName = entityName,
            EntityId = entityId,
            Timestamp = DateTime.UtcNow,
            Details = SerializeDetails(details)
        };

        _dbContext.AuditLogEntries.Add(entry);
        await _dbContext.SaveChangesAsync();
    }

    // JWT "sub" is remapped to ClaimTypes.NameIdentifier by the default inbound claim map, so check both.
    private Guid GetActorUserId()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        var claim = user?.FindFirst(JwtRegisteredClaimNames.Sub) ?? user?.FindFirst(ClaimTypes.NameIdentifier);
        return claim is not null && Guid.TryParse(claim.Value, out var id) ? id : Guid.Empty;
    }

    private static Dictionary<string, string> SerializeDetails(object? details)
    {
        if (details is null)
        {
            return new Dictionary<string, string>();
        }

        return new Dictionary<string, string> { ["data"] = JsonSerializer.Serialize(details) };
    }
}
