namespace Marvi.Api.Features.Identity.Contracts;

public record RegisterRequest(string Email, string Password, string CompanyName, string BillingAddress);
