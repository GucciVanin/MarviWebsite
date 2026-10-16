namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// The details a customer may change about their own company. `ShippingAddresses` replaces the whole list and is required
/// (an empty list clears it): leaving it out is a 400, so a request that forgets it cannot wipe the saved addresses.
/// </summary>
public record UpdateClientProfileRequest(string CompanyName, string BillingAddress, List<string> ShippingAddresses);
