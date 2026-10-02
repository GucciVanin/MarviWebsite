namespace Marvi.Api.Features.Orders.Contracts;

public record CreateEmployeeOrderRequest(Guid ClientId, string DeliveryAddress, List<EmployeeOrderLineItemRequest> LineItems);
