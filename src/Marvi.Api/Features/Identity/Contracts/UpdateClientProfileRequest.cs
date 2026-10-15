namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>The details a customer may change about their own company. `ShippingAddresses` replaces the whole list.</summary>
public record UpdateClientProfileRequest(string CompanyName, string BillingAddress, List<string>? ShippingAddresses);
