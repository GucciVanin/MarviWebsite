using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>
/// Customer eligibility (CONTEXT.md): only an Approved Customer may request a quote, accept one, or have an order
/// placed for them. One matrix over the three operations, through the real HTTP pipeline.
/// </summary>
public class CustomerEligibilityTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CustomerEligibilityTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData(ClientAccountStatus.Approved, HttpStatusCode.Created)]
    [InlineData(ClientAccountStatus.Pending, HttpStatusCode.Forbidden)]
    [InlineData(ClientAccountStatus.Suspended, HttpStatusCode.Forbidden)]
    public async Task RequestingAQuote_DependsOnCustomerEligibility(ClientAccountStatus status, HttpStatusCode expected)
    {
        var admin = await _factory.AdminAsync();
        var (client, accountId) = await _factory.RegisterClientAsync();
        var productId = await CreatePricedProductAsync(admin);
        await _factory.SetClientStatusAsync(accountId, status);

        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]));

        Assert.Equal(expected, response.StatusCode);
    }

    [Theory]
    [InlineData(ClientAccountStatus.Approved, HttpStatusCode.Created)]
    [InlineData(ClientAccountStatus.Pending, HttpStatusCode.Forbidden)]
    [InlineData(ClientAccountStatus.Suspended, HttpStatusCode.Forbidden)]
    public async Task AcceptingAPricedQuote_DependsOnCustomerEligibility(ClientAccountStatus status, HttpStatusCode expected)
    {
        var admin = await _factory.AdminAsync();
        var (client, accountId) = await _factory.RegisterClientAsync();
        var productId = await CreatePricedProductAsync(admin);
        var quote = await RequestAndPriceQuoteAsync(admin, client, productId);
        await _factory.SetClientStatusAsync(accountId, status);

        var response = await client.PostAsync($"/api/quotes/{quote.Id}/accept", null);

        Assert.Equal(expected, response.StatusCode);
    }

    [Theory]
    [InlineData(ClientAccountStatus.Approved, HttpStatusCode.Created)]
    [InlineData(ClientAccountStatus.Pending, HttpStatusCode.Forbidden)]
    [InlineData(ClientAccountStatus.Suspended, HttpStatusCode.Forbidden)]
    public async Task PlacingAnOrderForACustomer_DependsOnCustomerEligibility(ClientAccountStatus status, HttpStatusCode expected)
    {
        var admin = await _factory.AdminAsync();
        var (_, accountId) = await _factory.RegisterClientAsync();
        var productId = await CreatePricedProductAsync(admin);
        await _factory.SetClientStatusAsync(accountId, status);

        var response = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(accountId, "1 Main St", [new EmployeeOrderLineItemRequest(productId, 1)]));

        Assert.Equal(expected, response.StatusCode);
    }

    // The refusal messages are part of what a customer or employee sees, so they are pinned too.
    [Theory]
    [InlineData(ClientAccountStatus.Pending)]
    [InlineData(ClientAccountStatus.Suspended)]
    public async Task IneligibleCustomers_AreToldWhy(ClientAccountStatus status)
    {
        var admin = await _factory.AdminAsync();
        var (client, accountId) = await _factory.RegisterClientAsync();
        var productId = await CreatePricedProductAsync(admin);
        await _factory.SetClientStatusAsync(accountId, status);

        var quote = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]));
        var order = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(accountId, "1 Main St", [new EmployeeOrderLineItemRequest(productId, 1)]));

        Assert.Equal("Client account is not active.", await quote.Content.ReadAsStringAsync());
        Assert.Equal("Client account is not approved.", await order.Content.ReadAsStringAsync());
    }

    private static async Task<QuoteDto> RequestAndPriceQuoteAsync(HttpClient admin, HttpClient client, Guid productId)
    {
        var created = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]));
        created.EnsureSuccessStatusCode();
        var quote = (await created.Content.ReadFromJsonAsync<QuoteDto>())!;
        var priced = await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(quote.LineItems.Single().Id, 9m)]));
        priced.EnsureSuccessStatusCode();
        return quote;
    }

    private static async Task<Guid> CreatePricedProductAsync(HttpClient admin)
    {
        var productId = await admin.CreateProductAsync();
        var tiers = await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers");
        var put = await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing",
            new UpsertProductPricingRequest(tiers!.Single(t => t.IsDefault).Id, 10m, 1));
        put.EnsureSuccessStatusCode();
        return productId;
    }
}
