using Marvi.Domain.Orders;

namespace Marvi.Api.Features.Orders.Contracts;

public record OrderDto(Guid Id, Guid ClientAccountId, Guid? QuoteId, OrderStatus Status, string DeliveryAddress, Guid? WarehouseId, Guid? PlacedByEmployeeId, decimal TotalAmount, List<OrderLineItemDto> LineItems);
