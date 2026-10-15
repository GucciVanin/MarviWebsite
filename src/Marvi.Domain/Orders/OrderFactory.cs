namespace Marvi.Domain.Orders;

/// <summary>One line of an Order about to be placed: a product, a quantity and the price it was sold at.</summary>
public record OrderLineInput(Guid ProductId, int Qty, decimal UnitPrice);

/// <summary>The one place an Order is built, so its total is always the sum of its lines.</summary>
public static class OrderFactory
{
    public static Order Place(
        Guid clientAccountId,
        IEnumerable<OrderLineInput> lines,
        string deliveryAddress = "",
        Guid? quoteId = null,
        Guid? placedByEmployeeId = null)
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
