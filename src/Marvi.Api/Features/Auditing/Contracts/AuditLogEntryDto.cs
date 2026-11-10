namespace Marvi.Api.Features.Auditing.Contracts;

/// <summary>
/// One audit entry. `EntityNumber` is the customer, quote or order number when the entity is one of those (MRV-9.1), so the screen
/// names it without showing the id; it is null for other entities (the screen shows their name) or when the entity no longer exists.
/// </summary>
public record AuditLogEntryDto(
    Guid Id,
    Guid ActorUserId,
    string Action,
    string EntityName,
    Guid EntityId,
    int? EntityNumber,
    DateTime Timestamp,
    Dictionary<string, string> Details);
