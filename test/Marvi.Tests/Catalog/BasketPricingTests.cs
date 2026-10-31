using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Catalog;

/// <summary>
/// Basket pricing (CONTEXT.md): the same prices must come out of the quote request, the employee order and the
/// public catalog, whatever the tier, quantity break or Deal. Driven through the real HTTP pipeline.
/// </summary>
public class BasketPricingTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public BasketPricingTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    // Base 10; 8 from quantity 10. An active 10% Deal, an expired 50% one and a future 50% one all target the product.
    private async Task<(HttpClient Admin, Guid ProductId, Guid TierId)> SeedPricedProductWithDealsAsync()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var tierId = await DefaultTierIdAsync(admin);
        await PriceAsync(admin, productId, tierId, 10m, minQty: 1);
        await PriceAsync(admin, productId, tierId, 8m, minQty: 10);

        var now = DateTime.UtcNow;
        await DealAsync(admin, productId, DiscountType.Percent, 10m, now.AddDays(-1), now.AddDays(1));
        await DealAsync(admin, productId, DiscountType.Percent, 50m, now.AddDays(-10), now.AddDays(-5));
        await DealAsync(admin, productId, DiscountType.Percent, 50m, now.AddDays(5), now.AddDays(10));
        return (admin, productId, tierId);
    }

    [Fact]
    public async Task Quote_SuggestsTierPrice_WithQuantityBreakAndOnlyTheActiveDeal_AndLeavesUnpricedLinesEmpty()
    {
        var (admin, productId, _) = await SeedPricedProductWithDealsAsync();
        var unpriced = await admin.CreateProductAsync();
        var (client, _) = await _factory.RegisterClientAsync();

        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest(
            [new QuoteLineItemRequest(productId, 1), new QuoteLineItemRequest(productId, 10), new QuoteLineItemRequest(unpriced, 1)]));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var lines = (await response.Content.ReadFromJsonAsync<QuoteDto>())!.LineItems;
        Assert.Equal(9m, lines[0].SuggestedUnitPrice);   // 10 less the active 10% Deal
        Assert.Equal(7.2m, lines[1].SuggestedUnitPrice); // quantity break 8 less 10%
        Assert.Null(lines[2].SuggestedUnitPrice);
    }

    [Fact]
    public async Task EmployeeOrder_PricesLikeTheQuote_AndTotalsItsLines()
    {
        var (admin, productId, _) = await SeedPricedProductWithDealsAsync();
        var (_, accountId) = await _factory.RegisterClientAsync();

        var response = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(accountId, null,
            [new EmployeeOrderLineItemRequest(productId, 1), new EmployeeOrderLineItemRequest(productId, 10)]));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var order = (await response.Content.ReadFromJsonAsync<OrderDto>())!;
        Assert.Equal([9m, 7.2m], order.LineItems.Select(l => l.UnitPrice).ToArray());
        Assert.Equal(9m * 1 + 7.2m * 10, order.TotalAmount);
    }

    [Fact]
    public async Task Catalog_ShowsTheSamePriceAndDealName_AndNoPriceForUnpricedProducts()
    {
        var (admin, productId, _) = await SeedPricedProductWithDealsAsync();
        var unpriced = await admin.CreateProductAsync();

        var items = await _factory.CreateClient().GetFromJsonAsync<List<JsonElement>>("/api/products");

        var priced = items!.Single(i => i.GetProperty("id").GetGuid() == productId);
        Assert.Equal(9m, priced.GetProperty("price").GetDecimal());
        Assert.NotEqual(JsonValueKind.Null, priced.GetProperty("dealName").ValueKind);
        Assert.Equal(JsonValueKind.Null, items!.Single(i => i.GetProperty("id").GetGuid() == unpriced).GetProperty("price").ValueKind);
    }

    [Fact]
    public async Task EmployeeOrder_RefusesUnpricedProducts_NamingTheSkuAndTier()
    {
        var admin = await _factory.AdminAsync();
        var (_, accountId) = await _factory.RegisterClientAsync();
        var sku = $"NOPRICE-{Guid.NewGuid():N}";
        var unpriced = await admin.CreateProductAsync(sku);

        var response = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(accountId, null, [new EmployeeOrderLineItemRequest(unpriced, 1)]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal($"Product '{sku}' has no price configured for pricing tier 'Standard'.", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownProducts_AreRefusedInLineOrder_ByQuotesAndOrders()
    {
        var admin = await _factory.AdminAsync();
        var (client, accountId) = await _factory.RegisterClientAsync();
        var unknown = Guid.NewGuid();

        var quote = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(unknown, 1)]));
        var order = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(accountId, null, [new EmployeeOrderLineItemRequest(unknown, 1)]));

        Assert.Equal(HttpStatusCode.BadRequest, quote.StatusCode);
        Assert.Equal($"Product '{unknown}' not found.", await quote.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, order.StatusCode);
        Assert.Equal($"Product '{unknown}' not found.", await order.Content.ReadAsStringAsync());

        // The first problem in line order wins: an unpriced line before an unknown one is reported first.
        var unpriced = await admin.CreateProductAsync();
        var mixed = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(accountId, null,
            [new EmployeeOrderLineItemRequest(unpriced, 1), new EmployeeOrderLineItemRequest(unknown, 1)]));
        Assert.Contains("has no price configured", await mixed.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task InvalidLines_AreRefusedBeforeEligibilityIsChecked()
    {
        var (client, accountId) = await _factory.RegisterClientAsync();
        await _factory.SetClientStatusAsync(accountId, ClientAccountStatus.Suspended);

        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AcceptedQuote_BecomesAnOrderAtItsFinalPrices()
    {
        var (admin, productId, _) = await SeedPricedProductWithDealsAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var quote = await PricedQuoteAsync(admin, client, productId, finalPrice: 7m, qty: 3);

        var accepted = await client.PostAsync($"/api/quotes/{quote.Id}/accept", null);

        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        var order = (await accepted.Content.ReadFromJsonAsync<OrderDto>())!;
        Assert.Equal(21m, order.TotalAmount);
        Assert.Equal(7m, order.LineItems.Single().UnitPrice);
    }

    // Approved change (MRV-4.3): a missing final price used to become 0, i.e. a free order.
    [Fact]
    public async Task AcceptingAQuoteWithAnUnpricedLine_IsRefusedWith409_AndCreatesNoOrder()
    {
        var (admin, productId, _) = await SeedPricedProductWithDealsAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var quote = await PricedQuoteAsync(admin, client, productId, finalPrice: 7m, qty: 1);
        await ClearFinalPriceAsync(quote.LineItems.Single().Id);

        var response = await client.PostAsync($"/api/quotes/{quote.Id}/accept", null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!);
    }

    private async Task ClearFinalPriceAsync(Guid quoteLineItemId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.QuoteLineItems.FindAsync(quoteLineItemId))!.FinalUnitPrice = null;
        await db.SaveChangesAsync();
    }

    private static async Task<QuoteDto> PricedQuoteAsync(HttpClient admin, HttpClient client, Guid productId, decimal finalPrice, int qty)
    {
        var created = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, qty)]));
        created.EnsureSuccessStatusCode();
        var quote = (await created.Content.ReadFromJsonAsync<QuoteDto>())!;
        (await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(quote.LineItems.Single().Id, finalPrice)]))).EnsureSuccessStatusCode();
        return quote;
    }

    private async Task<Guid> DefaultTierIdAsync(HttpClient admin)
    {
        // The default tier is created on first use (registration), so make sure it exists whatever order tests run in.
        await _factory.RegisterClientAsync();
        return (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!.Single(t => t.IsDefault).Id;
    }

    private static async Task PriceAsync(HttpClient admin, Guid productId, Guid tierId, decimal unitPrice, int minQty) =>
        (await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing", new UpsertProductPricingRequest(tierId, unitPrice, minQty))).EnsureSuccessStatusCode();

    private static async Task DealAsync(HttpClient admin, Guid productId, DiscountType type, decimal value, DateTime start, DateTime end) =>
        (await admin.PostAsJsonAsync("/api/admin/deals",
            new UpsertDealRequest($"Deal {Guid.NewGuid():N}", type, value, start, end, [productId], [], 1))).EnsureSuccessStatusCode();
}
