namespace Marvi.Api.Features.Contact.Contracts;

/// <summary>The contact form. <c>Website</c> is the honeypot: people never see it, so a value there means a bot.</summary>
public record ContactRequest(string? Name, string? Email, string? Phone, string? Company, string? Message, string? Website);

/// <summary>A contact message as the admin sees it.</summary>
public record ContactMessageDto(Guid Id, string Name, string Email, string? Phone, string? Company, string Message, DateTime CreatedAt, DateTime? HandledAt);
