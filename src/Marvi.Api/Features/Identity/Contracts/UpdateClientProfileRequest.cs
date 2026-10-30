namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>The details a customer may change about their own company: the company name. Addresses have their own endpoints (MRV-9.3).</summary>
public record UpdateClientProfileRequest(string CompanyName);
