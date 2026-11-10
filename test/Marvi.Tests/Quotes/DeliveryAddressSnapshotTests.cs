using Marvi.Domain.Delivery;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;

namespace Marvi.Tests.Quotes;

/// <summary>MRV-9.6, the domain side: what a snapshot copies, how it reads on one line, and when it may change.</summary>
public class DeliveryAddressSnapshotTests
{
    private static ClientAddress Address(string label = "Filial", string number = "200", string? complement = "Sala 3") => new()
    {
        Id = Guid.NewGuid(),
        Key = Guid.NewGuid(),
        Label = label,
        Kind = ClientAddressKind.Delivery,
        PostalCode = "13010000",
        Street = "Rua Barão de Jaguara",
        Number = number,
        Complement = complement,
        District = "Centro",
        City = "Campinas",
        State = "SP",
        DeliveryNotes = "Entregar de manhã",
    };

    private static Quote PricedQuote(ClientAddress? address)
    {
        var service = new QuoteWorkflowService();
        var quote = service.CreateQuote(Guid.NewGuid(), [new QuoteLineItem { Id = Guid.NewGuid(), ProductId = Guid.NewGuid(), Qty = 1 }], address);
        service.PriceQuote(quote, null, quote.LineItems.Select(li => (li.Id, 5m)));
        return quote;
    }

    [Fact]
    public void ACopy_HasEveryFieldOfTheAddress_AndLinksToIt()
    {
        var address = Address();

        var quote = new QuoteWorkflowService().CreateQuote(Guid.NewGuid(), [], address);

        Assert.Equal(address.Id, quote.DeliveryAddressId);
        Assert.Equal(("Filial", "Rua Barão de Jaguara", "200", "Sala 3", "Centro", "Campinas", "SP", "13010000", "Entregar de manhã"),
            (quote.DeliveryAddressLabel, quote.DeliveryAddressStreet, quote.DeliveryAddressNumber, quote.DeliveryAddressComplement, quote.DeliveryAddressDistrict,
                quote.DeliveryAddressCity, quote.DeliveryAddressState, quote.DeliveryAddressPostalCode, quote.DeliveryAddressNotes));
    }

    [Fact]
    public void ChangingTheAddressRowAfterwards_DoesNotChangeTheCopy()
    {
        var address = Address();
        var quote = new QuoteWorkflowService().CreateQuote(Guid.NewGuid(), [], address);

        address.Street = "Rua Mudada";
        address.Label = "Outro";

        Assert.Equal("Rua Barão de Jaguara", quote.DeliveryAddressStreet);
        Assert.Equal("Filial", quote.DeliveryAddressLabel);
    }

    [Theory]
    [InlineData("200", "Sala 3", "Rua Barão de Jaguara, 200 - Sala 3, Centro, Campinas/SP, CEP 13010-000")]
    [InlineData("200", null, "Rua Barão de Jaguara, 200, Centro, Campinas/SP, CEP 13010-000")]
    [InlineData("", null, "Rua Barão de Jaguara, Centro, Campinas/SP, CEP 13010-000")]
    public void TheOneLineText_ReadsLikeTheScreens(string number, string? complement, string expected)
    {
        var quote = new QuoteWorkflowService().CreateQuote(Guid.NewGuid(), [], Address(number: number, complement: complement));

        Assert.Equal(expected, quote.Line());
    }

    [Fact]
    public void AnAddressStillWaitingForReview_ReadsWithoutTheEmptyParts()
    {
        var legacy = Address();
        legacy.Street = "Av. Brasil 100 sala 2";
        (legacy.Number, legacy.Complement, legacy.District, legacy.City, legacy.State, legacy.PostalCode) = ("", null, "", "", "", "");

        var quote = new QuoteWorkflowService().CreateQuote(Guid.NewGuid(), [], legacy);

        Assert.Equal("Av. Brasil 100 sala 2", quote.Line());
    }

    [Fact]
    public void AQuoteWithoutAnAddress_HasNoSnapshot_AndAnEmptyLine()
    {
        var quote = new QuoteWorkflowService().CreateQuote(Guid.NewGuid(), [], null);

        Assert.False(quote.Has());
        Assert.Equal(string.Empty, quote.Line());
    }

    [Fact]
    public void TheAddressChangesWhileSubmittedOrPriced_AndNotAfterwards()
    {
        var service = new QuoteWorkflowService();
        var first = Address("Matriz", "1");
        var second = Address("Filial", "2");
        var quote = service.CreateQuote(Guid.NewGuid(), [new QuoteLineItem { Id = Guid.NewGuid(), ProductId = Guid.NewGuid(), Qty = 1 }], first);

        service.ChangeDeliveryAddress(quote, second);
        service.PriceQuote(quote, null, quote.LineItems.Select(li => (li.Id, 5m)));
        service.ChangeDeliveryAddress(quote, first);
        service.AcceptQuote(quote);

        Assert.Equal("Matriz", quote.DeliveryAddressLabel);
        Assert.Throws<InvalidOperationException>(() => service.ChangeDeliveryAddress(quote, second));
        Assert.Equal("Matriz", quote.DeliveryAddressLabel);
    }

    [Fact]
    public void AQuoteWithoutAnAddress_CannotBeAccepted_UntilOneIsChosen_AndNoOrderIsBuilt()
    {
        var service = new QuoteWorkflowService();
        var quote = PricedQuote(null);

        var refused = Assert.Throws<QuoteWithoutDeliveryAddressException>(() => service.AcceptQuote(quote));

        Assert.Equal("Escolha o endereço de entrega antes de aceitar o orçamento.", refused.Message);
        Assert.Equal(QuoteStatus.Priced, quote.Status);
        service.ChangeDeliveryAddress(quote, Address());
        Assert.NotEmpty(service.AcceptQuote(quote).DeliveryAddress);
    }

    [Fact]
    public void AnAddressWrittenOutAsOneLine_IsCutToTheLengthOfTheOrderColumn()
    {
        var long_ = Address();
        long_.Street = new string('x', 500);
        var order = OrderFactory.Place(Guid.NewGuid(), [new OrderLineInput(Guid.NewGuid(), 1, 3m)], deliveryTo: new QuoteWorkflowService().CreateQuote(Guid.NewGuid(), [], long_));

        Assert.Equal(Order.MaxDeliveryAddressLength, order.DeliveryAddress.Length);
        Assert.Equal(new string('x', 500), order.DeliveryAddressStreet);
    }

    [Fact]
    public void ARejectedQuote_KeepsItsAddress()
    {
        var service = new QuoteWorkflowService();
        var quote = PricedQuote(Address("Matriz", "1"));
        service.RejectQuote(quote);

        Assert.Throws<InvalidOperationException>(() => service.ChangeDeliveryAddress(quote, Address("Filial", "2")));
        Assert.Equal("Matriz", quote.DeliveryAddressLabel);
    }

    [Fact]
    public void TheOrderOfAnAcceptedQuote_GetsTheQuotesAddress_WrittenOutAsItsText()
    {
        var quote = PricedQuote(Address());

        var order = new QuoteWorkflowService().AcceptQuote(quote);

        Assert.Equal(quote.Id, order.QuoteId);
        Assert.Equal(quote.DeliveryAddressId, order.DeliveryAddressId);
        Assert.Equal("Filial", order.DeliveryAddressLabel);
        Assert.Equal("Rua Barão de Jaguara, 200 - Sala 3, Centro, Campinas/SP, CEP 13010-000", order.DeliveryAddress);
    }

    [Fact]
    public void AnOrderPlacedWithFreeText_KeepsTheTextAndHasNoSnapshot()
    {
        var order = OrderFactory.Place(Guid.NewGuid(), [new OrderLineInput(Guid.NewGuid(), 1, 3m)], "Rua Antiga, 5");

        Assert.Equal("Rua Antiga, 5", order.DeliveryAddress);
        Assert.False(order.Has());
    }

    [Theory]
    [InlineData(OrderStatus.Placed, true)]
    [InlineData(OrderStatus.Backordered, true)]
    [InlineData(OrderStatus.Fulfilled, false)]
    [InlineData(OrderStatus.Cancelled, false)]
    public void AnOrderAddress_CanBeAmendedOnlyBeforeItIsShipped(OrderStatus status, bool allowed)
    {
        var order = OrderFactory.Place(Guid.NewGuid(), [new OrderLineInput(Guid.NewGuid(), 1, 3m)], "Rua Antiga, 5");
        order.Status = status;

        if (allowed)
        {
            order.ChangeDeliveryAddress(Address());
            Assert.Equal("Filial", order.DeliveryAddressLabel);
            Assert.StartsWith("Rua Barão de Jaguara, 200", order.DeliveryAddress);
        }
        else
        {
            Assert.Throws<InvalidOperationException>(() => order.ChangeDeliveryAddress(Address()));
            Assert.Equal("Rua Antiga, 5", order.DeliveryAddress);
        }
    }
}
