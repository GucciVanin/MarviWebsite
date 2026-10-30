namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>Registration (MRV-9.3): the company name and the billing address in the structured form; it becomes the customer's first address.</summary>
public record RegisterRequest(string Email, string Password, string CompanyName, ClientAddressRequest BillingAddress);
