namespace Marvi.Api.Features.Orders.Contracts;

public record EmployeeOrderLineItemRequest(Guid ProductId, int Qty);
