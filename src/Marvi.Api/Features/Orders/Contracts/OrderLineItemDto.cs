namespace Marvi.Api.Features.Orders.Contracts;

public record OrderLineItemDto(Guid Id, Guid ProductId, string ProductName, int Qty, decimal UnitPrice);
