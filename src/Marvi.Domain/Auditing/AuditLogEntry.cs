namespace Marvi.Domain.Auditing;

public class AuditLogEntry
{
    public Guid Id { get; set; }
    public Guid ActorUserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
    public DateTime Timestamp { get; set; }

    // Diff/details blob; Infrastructure maps this to a jsonb column.
    public Dictionary<string, string> Details { get; set; } = new();
}
