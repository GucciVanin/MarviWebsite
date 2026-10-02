namespace Marvi.Api.Features.Identity.Contracts;

public record AuthResponse(string Token, DateTime ExpiresAt);
