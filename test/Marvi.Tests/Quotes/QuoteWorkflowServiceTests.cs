using Marvi.Domain.Quotes;

namespace Marvi.Tests.Quotes;

public class QuoteWorkflowServiceTests
{
    private readonly QuoteWorkflowService _sut = new();

    [Fact]
    public void FullWorkflow_SubmittedToPricedToAccepted_Succeeds()
    {
        var clientAccountId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var lineItem = new QuoteLineItem { Id = Guid.NewGuid(), ProductId = productId, Qty = 3, SuggestedUnitPrice = 50m };

        var quote = _sut.CreateQuote(clientAccountId, [lineItem]);
        Assert.Equal(QuoteStatus.Submitted, quote.Status);

        var employeeId = Guid.NewGuid();
        _sut.PriceQuote(quote, employeeId, [(lineItem.Id, 45m)]);
        Assert.Equal(QuoteStatus.Priced, quote.Status);
        Assert.Equal(employeeId, quote.PricedByEmployeeId);
        Assert.Equal(45m, quote.LineItems.Single().FinalUnitPrice);

        var order = _sut.AcceptQuote(quote);

        Assert.Equal(QuoteStatus.Accepted, quote.Status);
        Assert.Equal(clientAccountId, order.ClientAccountId);
        Assert.Equal(quote.Id, order.QuoteId);
        Assert.Equal(135m, order.TotalAmount);
        var orderLine = Assert.Single(order.LineItems);
        Assert.Equal(productId, orderLine.ProductId);
        Assert.Equal(3, orderLine.Qty);
        Assert.Equal(45m, orderLine.UnitPrice);
    }

    [Fact]
    public void AcceptQuote_WhenNotPriced_ThrowsInvalidOperationException()
    {
        var quote = _sut.CreateQuote(Guid.NewGuid(), []);

        Assert.Throws<InvalidOperationException>(() => _sut.AcceptQuote(quote));
    }
}
