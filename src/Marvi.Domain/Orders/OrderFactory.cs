using Marvi.Domain.Delivery;

namespace Marvi.Domain.Orders;

/// <summary>One line of an Order about to be placed: a product, a quantity and the price it was sold at.</summary>
public record OrderLineInput(Guid ProductId, int Qty, decimal UnitPrice);

/// <summary>The one place an Order is built, so its total is always the sum of its lines.</summary>
public static class OrderFactory
{
    /// <param name="deliveryAddress">The legacy free text of the address, used only when there is no structured <paramref name="deliveryTo"/>.</param>
    /// <param name="deliveryTo">The snapshot of the address the order is delivered to (a quote's, or one just made from a customer's address); copied onto the order, and written out as the order's one-line text.</param>
    public static Order Place(
        Guid clientAccountId,
        IEnumerable<OrderLineInput> lines,
        string deliveryAddress = "",
        Guid? quoteId = null,
        Guid? placedByEmployeeId = null,
        IHasDeliveryAddress? deliveryTo = null)
    {
        var order = new Order
        {
            Id = Guid.NewGuid(),
            ClientAccountId = clientAccountId,
            QuoteId = quoteId,
            Status = OrderStatus.Placed,
            PlacedAt = DateTime.UtcNow,
            DeliveryAddress = deliveryAddress,
            PlacedByEmployeeId = placedByEmployeeId
        };

        if (deliveryTo is not null && deliveryTo.Has())
        {
            order.CopyFrom(deliveryTo);
            order.DeliveryAddress = DeliveryAddressSnapshot.LineForText(order);
        }

        order.LineItems = lines.Select(line => new OrderLineItem
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            ProductId = line.ProductId,
            Qty = line.Qty,
            UnitPrice = line.UnitPrice
        }).ToList();
        order.TotalAmount = order.LineItems.Sum(li => li.UnitPrice * li.Qty);
        return order;
    }
}
