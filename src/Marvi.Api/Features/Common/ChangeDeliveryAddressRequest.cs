namespace Marvi.Api.Features.Common;

/// <summary>Another delivery address for a quote the customer has not accepted yet, or an order staff amend (MRV-9.6): the key of one of that customer's addresses.</summary>
public record ChangeDeliveryAddressRequest(Guid DeliveryAddressKey);
