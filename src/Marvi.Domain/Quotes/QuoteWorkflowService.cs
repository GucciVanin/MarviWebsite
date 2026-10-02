using Marvi.Domain.Orders;

namespace Marvi.Domain.Quotes;

public class QuoteWorkflowService
{
    public Quote CreateQuote(Guid clientAccountId, IEnumerable<QuoteLineItem> lineItems)
    {
        var quote = new Quote
        {
            Id = Guid.NewGuid(),
            ClientAccountId = clientAccountId,
            Status = QuoteStatus.Submitted,
            CreatedAt = DateTime.UtcNow,
            LineItems = lineItems.ToList()
        };

        foreach (var lineItem in quote.LineItems)
        {
            lineItem.QuoteId = quote.Id;
        }

        return quote;
    }

    /// <param name="employeeId">The pricing employee, or null when an admin without an employee account prices the quote.</param>
    public void PriceQuote(Quote quote, Guid? employeeId, IEnumerable<(Guid LineItemId, decimal FinalUnitPrice)> finalPrices)
    {
        if (quote.Status != QuoteStatus.Submitted)
        {
            throw new InvalidOperationException($"Quote must be in '{QuoteStatus.Submitted}' status to be priced, but was '{quote.Status}'.");
        }

        var pricesById = finalPrices.ToDictionary(p => p.LineItemId, p => p.FinalUnitPrice);

        if (pricesById.Values.Any(price => price < 0))
        {
            throw new InvalidOperationException("Final unit prices cannot be negative.");
        }

        var unpriced = quote.LineItems.Where(li => !pricesById.ContainsKey(li.Id)).ToList();
        if (unpriced.Count > 0)
        {
            throw new InvalidOperationException("Every line item must be given a final unit price.");
        }

        foreach (var lineItem in quote.LineItems)
        {
            if (pricesById.TryGetValue(lineItem.Id, out var finalPrice))
            {
                lineItem.FinalUnitPrice = finalPrice;
            }
        }

        quote.Status = QuoteStatus.Priced;
        quote.PricedByEmployeeId = employeeId;
    }

    public Order AcceptQuote(Quote quote)
    {
        if (quote.Status != QuoteStatus.Priced)
        {
            throw new InvalidOperationException($"Quote must be in '{QuoteStatus.Priced}' status to be accepted, but was '{quote.Status}'.");
        }

        quote.Status = QuoteStatus.Accepted;

        var order = new Order
        {
            Id = Guid.NewGuid(),
            ClientAccountId = quote.ClientAccountId,
            QuoteId = quote.Id,
            Status = OrderStatus.Placed,
            TotalAmount = quote.LineItems.Sum(li => (li.FinalUnitPrice ?? 0m) * li.Qty)
        };

        order.LineItems = quote.LineItems.Select(li => new OrderLineItem
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            ProductId = li.ProductId,
            Qty = li.Qty,
            UnitPrice = li.FinalUnitPrice ?? 0m
        }).ToList();

        return order;
    }
}
