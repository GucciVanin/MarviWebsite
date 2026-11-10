namespace Marvi.Api.Features.Orders.Contracts;

/// <summary>
/// An order placed by staff for a customer. <c>DeliveryAddressKey</c> is the key of one of THAT customer's delivery addresses (MRV-9.6); omitted means
/// their default delivery address. <c>DeliveryAddress</c>, the old free text, is accepted only for a customer who has no structured address at all
/// (a legacy fallback for one release) and is refused for any other: staff do not invent an address for a customer.
/// </summary>
public record CreateEmployeeOrderRequest(Guid ClientId, string? DeliveryAddress, List<EmployeeOrderLineItemRequest> LineItems, Guid? DeliveryAddressKey = null);
