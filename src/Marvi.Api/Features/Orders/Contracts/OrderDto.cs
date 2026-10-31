using Marvi.Api.Features.Common;
using Marvi.Domain.Orders;

namespace Marvi.Api.Features.Orders.Contracts;

/// <summary>
/// An order. `Number` is its business reference; `CustomerNumber`/`CompanyName` say who it is for (MRV-9.1). `DeliveryAddress` is the address on
/// one line (the legacy free text on an order made before MRV-9.6) and `DeliveryAddressSnapshot` its structured copy, null on such an order.
/// </summary>
public record OrderDto(Guid Id, int Number, Guid ClientAccountId, int CustomerNumber, string CompanyName, Guid? QuoteId, OrderStatus Status, string DeliveryAddress, Guid? WarehouseId, Guid? PlacedByEmployeeId, DateTime PlacedAt, decimal TotalAmount, List<OrderLineItemDto> LineItems, DeliveryAddressSnapshotDto? DeliveryAddressSnapshot = null)
{
    /// <summary>The one mapping from an Order (with its line items, their products and its customer loaded) to its API shape.</summary>
    public static OrderDto From(Order order) => new(
        order.Id,
        order.Number,
        order.ClientAccountId,
        order.ClientAccount?.Number ?? 0,
        order.ClientAccount?.CompanyName ?? string.Empty,
        order.QuoteId,
        order.Status,
        order.DeliveryAddress,
        order.WarehouseId,
        order.PlacedByEmployeeId,
        order.PlacedAt,
        order.TotalAmount,
        order.LineItems.Select(li => new OrderLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.UnitPrice)).ToList(),
        DeliveryAddressSnapshotDto.From(order));
}
