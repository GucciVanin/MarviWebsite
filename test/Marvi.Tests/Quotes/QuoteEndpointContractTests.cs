using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Quotes;

/// <summary>MRV-3.5: validation and not-found answers of the quote endpoints, and the staff queue.</summary>
public class QuoteEndpointContractTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public QuoteEndpointContractTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task CreateQuote_RejectsAnEmptyBasket_ABadQuantity_AndAnUnknownProduct()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var admin = await _factory.AdminAsync();
        var product = await admin.CreatePricedProductAsync(10m);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 0)]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(Guid.NewGuid(), 1)]))).StatusCode);
    }

    [Fact]
    public async Task AcceptAndReject_OfAnUnknownQuote_Are404()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/quotes/{Guid.NewGuid()}/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/quotes/{Guid.NewGuid()}/reject", null)).StatusCode);
    }

    [Fact]
    public async Task PriceQuote_RejectsAnEmptyList_AndAnUnknownQuote()
    {
        var admin = await _factory.AdminAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/employee/quotes/{Guid.NewGuid()}/price", new PriceQuoteRequest([]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/employee/quotes/{Guid.NewGuid()}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(Guid.NewGuid(), 5m)]))).StatusCode);
    }

    [Fact]
    public async Task Queue_ListsASubmittedQuote_ForStaff()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var admin = await _factory.AdminAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var created = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 2)]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var quote = (await created.Content.ReadFromJsonAsync<QuoteDto>())!;

        var response = await admin.GetAsync("/api/employee/quotes/queue");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var queue = (await response.Content.ReadFromJsonAsync<List<QuoteDto>>())!;
        Assert.Contains(queue, q => q.Id == quote.Id);
    }
}
