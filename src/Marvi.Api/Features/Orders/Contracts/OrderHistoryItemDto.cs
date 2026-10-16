using Marvi.Domain.Orders;

namespace Marvi.Api.Features.Orders.Contracts;

/// <summary>An order in the employee history (MRV-1.2b): everything in <see cref="OrderDto"/> plus the customer's company name.</summary>
public record OrderHistoryItemDto(
    Guid Id,
    Guid ClientAccountId,
    string CompanyName,
    Guid? QuoteId,
    OrderStatus Status,
    string DeliveryAddress,
    Guid? WarehouseId,
    Guid? PlacedByEmployeeId,
    DateTime PlacedAt,
    decimal TotalAmount,
    List<OrderLineItemDto> LineItems)
{
    public static OrderHistoryItemDto From(Order order)
    {
        var dto = OrderDto.From(order);
        return new OrderHistoryItemDto(
            dto.Id, dto.ClientAccountId, order.ClientAccount?.CompanyName ?? string.Empty, dto.QuoteId, dto.Status, dto.DeliveryAddress,
            dto.WarehouseId, dto.PlacedByEmployeeId, dto.PlacedAt, dto.TotalAmount, dto.LineItems);
    }
}
