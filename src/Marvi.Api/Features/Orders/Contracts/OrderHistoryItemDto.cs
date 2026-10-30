using Marvi.Domain.Orders;

namespace Marvi.Api.Features.Orders.Contracts;

/// <summary>An order in the employee history (MRV-1.2b): the same shape as <see cref="OrderDto"/>, which already names the customer.</summary>
public record OrderHistoryItemDto(
    Guid Id,
    int Number,
    Guid ClientAccountId,
    int CustomerNumber,
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
            dto.Id, dto.Number, dto.ClientAccountId, dto.CustomerNumber, dto.CompanyName, dto.QuoteId, dto.Status, dto.DeliveryAddress,
            dto.WarehouseId, dto.PlacedByEmployeeId, dto.PlacedAt, dto.TotalAmount, dto.LineItems);
    }
}
