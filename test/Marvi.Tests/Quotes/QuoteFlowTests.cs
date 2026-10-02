using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Marvi.Tests.Support;

namespace Marvi.Tests.Quotes;

/// <summary>The MVP's core path through the real HTTP pipeline: register → quote → price → accept, plus order-taking.</summary>
public class QuoteFlowTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public QuoteFlowTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task NewClient_CanRequestQuote_AdminCanPriceIt_ClientCanAccept()
    {
        var admin = await LoginAsync(MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword);
        var (client, clientAccountId) = await RegisterClientAsync();
        var productId = await CreatePricedProductAsync(admin, unitPrice: 10m);

        // Registration gives immediate access and the default tier: no approval step is needed to ask for a quote.
        var created = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 3)]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var quote = (await created.Content.ReadFromJsonAsync<QuoteDto>())!;
        Assert.Equal(QuoteStatus.Submitted, quote.Status);
        Assert.Equal(10m, quote.LineItems.Single().SuggestedUnitPrice);

        // An Admin has no employee account but must still be able to work the quote queue.
        var priced = await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(quote.LineItems.Single().Id, 9m)]));
        Assert.Equal(HttpStatusCode.OK, priced.StatusCode);
        Assert.Null((await priced.Content.ReadFromJsonAsync<QuoteDto>())!.PricedByEmployeeId);

        var accepted = await client.PostAsync($"/api/quotes/{quote.Id}/accept", null);
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        var order = (await accepted.Content.ReadFromJsonAsync<OrderDto>())!;
        Assert.Equal(clientAccountId, order.ClientAccountId);
        Assert.Equal(27m, order.TotalAmount);
        Assert.Equal(OrderStatus.Placed, order.Status);
    }

    [Fact]
    public async Task CreateQuote_RejectsEmptyQuotesAndNonPositiveQuantities()
    {
        var admin = await LoginAsync(MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword);
        var (client, _) = await RegisterClientAsync();
        var productId = await CreatePricedProductAsync(admin, unitPrice: 10m);

        var empty = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([]));
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);

        var zeroQty = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 0)]));
        Assert.Equal(HttpStatusCode.BadRequest, zeroQty.StatusCode);
    }

    [Fact]
    public async Task PriceQuote_RequiresEveryLineToBePriced()
    {
        var admin = await LoginAsync(MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword);
        var (client, _) = await RegisterClientAsync();
        var first = await CreatePricedProductAsync(admin, unitPrice: 10m);
        var second = await CreatePricedProductAsync(admin, unitPrice: 20m);

        var created = await client.PostAsJsonAsync("/api/quotes",
            new CreateQuoteRequest([new QuoteLineItemRequest(first, 1), new QuoteLineItemRequest(second, 1)]));
        var quote = (await created.Content.ReadFromJsonAsync<QuoteDto>())!;

        var partial = await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(quote.LineItems[0].Id, 9m)]));
        Assert.Equal(HttpStatusCode.BadRequest, partial.StatusCode);

        var negative = await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price",
            new PriceQuoteRequest(quote.LineItems.Select(li => new PriceQuoteLineRequest(li.Id, -1m)).ToList()));
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);
    }

    [Fact]
    public async Task EmployeeOrder_UsesClientTierPrice_AndRefusesToSellUnpricedProductsForFree()
    {
        var admin = await LoginAsync(MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword);
        var (_, clientAccountId) = await RegisterClientAsync();
        var priced = await CreatePricedProductAsync(admin, unitPrice: 12m);
        var unpriced = await CreateProductAsync(admin);

        var ok = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(clientAccountId, "1 Main St", [new EmployeeOrderLineItemRequest(priced, 2)]));
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        Assert.Equal(24m, (await ok.Content.ReadFromJsonAsync<OrderDto>())!.TotalAmount);

        var free = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(clientAccountId, "1 Main St", [new EmployeeOrderLineItemRequest(unpriced, 1)]));
        Assert.Equal(HttpStatusCode.BadRequest, free.StatusCode);

        var noAddress = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(clientAccountId, " ", [new EmployeeOrderLineItemRequest(priced, 1)]));
        Assert.Equal(HttpStatusCode.BadRequest, noAddress.StatusCode);
    }

    [Fact]
    public async Task SuspendedClient_CannotRequestQuotes()
    {
        var admin = await LoginAsync(MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword);
        var (client, clientAccountId) = await RegisterClientAsync();
        var productId = await CreatePricedProductAsync(admin, unitPrice: 10m);

        var suspend = await admin.PutAsync($"/api/admin/clients/{clientAccountId}/suspend", null);
        Assert.Equal(HttpStatusCode.NoContent, suspend.StatusCode);

        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private async Task<HttpClient> LoginAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return client;
    }

    private async Task<(HttpClient Client, Guid ClientAccountId)> RegisterClientAsync()
    {
        var email = $"{Guid.NewGuid()}@example.com";
        var anonymous = _factory.CreateClient();
        var register = await anonymous.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", "123 Main St"));
        register.EnsureSuccessStatusCode();
        var clientAccountId = JsonDocument.Parse(await register.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        return (await LoginAsync(email, "Test1234!"), clientAccountId);
    }

    private static async Task<Guid> CreateProductAsync(HttpClient admin)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/products",
            new UpsertProductRequest($"SKU-{Guid.NewGuid():N}", "Widget", null, null, null, true, new Dictionary<string, string>()));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProductAdminDto>())!.Id;
    }

    /// <summary>Creates a product priced for the default tier (the tier new clients are assigned).</summary>
    private static async Task<Guid> CreatePricedProductAsync(HttpClient admin, decimal unitPrice)
    {
        var productId = await CreateProductAsync(admin);
        var tiers = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!;
        var defaultTier = Assert.Single(tiers, t => t.IsDefault);

        var priced = await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing",
            new UpsertProductPricingRequest(defaultTier.Id, unitPrice, 1));
        priced.EnsureSuccessStatusCode();
        return productId;
    }
}
