namespace Marvi.Api.Features.Auditing.Contracts;

public record AuditLogEntryDto(
    Guid Id,
    Guid ActorUserId,
    string Action,
    string EntityName,
    Guid EntityId,
    DateTime Timestamp,
    Dictionary<string, string> Details);
