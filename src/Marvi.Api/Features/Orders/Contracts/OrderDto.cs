using Marvi.Domain.Orders;

namespace Marvi.Api.Features.Orders.Contracts;

public record OrderDto(Guid Id, Guid ClientAccountId, Guid? QuoteId, OrderStatus Status, string DeliveryAddress, Guid? WarehouseId, Guid? PlacedByEmployeeId, DateTime PlacedAt, decimal TotalAmount, List<OrderLineItemDto> LineItems)
{
    /// <summary>The one mapping from an Order (with its line items and their products loaded) to its API shape.</summary>
    public static OrderDto From(Order order) => new(
        order.Id,
        order.ClientAccountId,
        order.QuoteId,
        order.Status,
        order.DeliveryAddress,
        order.WarehouseId,
        order.PlacedByEmployeeId,
        order.PlacedAt,
        order.TotalAmount,
        order.LineItems.Select(li => new OrderLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.UnitPrice)).ToList());
}
