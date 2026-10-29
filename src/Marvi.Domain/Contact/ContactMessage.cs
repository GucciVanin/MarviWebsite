namespace Marvi.Domain.Contact;

/// <summary>
/// A message a visitor sent through the site's contact form (MRV-2.8). The text is untrusted input from anyone on the internet:
/// it is stored and shown to an admin as plain text, never interpreted. <see cref="HandledAt"/> is empty until an admin marks it handled.
/// </summary>
public class ContactMessage
{
    public const int MaxNameLength = 100;
    public const int MaxEmailLength = 200;
    public const int MaxPhoneLength = 30;
    public const int MaxCompanyLength = 150;
    public const int MinMessageLength = 10;
    public const int MaxMessageLength = 2000;

    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Company { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? HandledAt { get; set; }
}
