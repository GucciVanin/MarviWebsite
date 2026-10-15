using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Quotes;

/// <summary>MRV-1.2a: an employee reads every quote ever requested, paged and filterable.</summary>
public class QuoteHistoryTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public QuoteHistoryTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<QuoteDto> RequestQuoteAsync(HttpClient client, Guid productId)
    {
        var created = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]));
        created.EnsureSuccessStatusCode();
        return (await created.Content.ReadFromJsonAsync<QuoteDto>())!;
    }

    private async Task SetCreatedAtAsync(Guid quoteId, DateTime createdAt)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Quotes.FindAsync(quoteId))!.CreatedAt = createdAt;
        await db.SaveChangesAsync();
    }

    private static async Task<PagedResult<QuoteDto>> HistoryAsync(HttpClient employee, string query)
    {
        var response = await employee.GetAsync($"/api/employee/quotes/history{query}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PagedResult<QuoteDto>>())!;
    }

    [Fact]
    public async Task History_ListsEveryStatus_NewestFirst_ForTheChosenCustomerOnly()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreateProductAsync();
        var (alice, aliceId) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();
        var first = await RequestQuoteAsync(alice, product);
        var second = await RequestQuoteAsync(alice, product);
        await RequestQuoteAsync(bob, product);
        await SetCreatedAtAsync(first.Id, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        await SetCreatedAtAsync(second.Id, new DateTime(2026, 2, 1, 0, 0, 0, DateTimeKind.Utc));
        // A quote that left the queue (priced, then rejected) is still part of the history.
        var priced = await admin.PutAsJsonAsync($"/api/employee/quotes/{first.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(first.LineItems.Single().Id, 5m)]));
        priced.EnsureSuccessStatusCode();
        (await alice.PostAsync($"/api/quotes/{first.Id}/reject", null)).EnsureSuccessStatusCode();

        var history = await HistoryAsync(admin, $"?clientId={aliceId}");

        Assert.Equal(2, history.TotalCount);
        Assert.Equal([second.Id, first.Id], history.Items.Select(q => q.Id));
        Assert.Equal([QuoteStatus.Submitted, QuoteStatus.Rejected], history.Items.Select(q => q.Status));
        Assert.All(history.Items, q => Assert.Equal(aliceId, q.ClientAccountId));
    }

    [Fact]
    public async Task History_FiltersByStatus_AndByDateRange()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreateProductAsync();
        var (client, clientId) = await _factory.RegisterClientAsync();
        var january = await RequestQuoteAsync(client, product);
        var march = await RequestQuoteAsync(client, product);
        await SetCreatedAtAsync(january.Id, new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc));
        await SetCreatedAtAsync(march.Id, new DateTime(2026, 3, 15, 0, 0, 0, DateTimeKind.Utc));
        (await admin.PutAsJsonAsync($"/api/employee/quotes/{march.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(march.LineItems.Single().Id, 5m)]))).EnsureSuccessStatusCode();

        var priced = await HistoryAsync(admin, $"?clientId={clientId}&status=Priced");
        var february = await HistoryAsync(admin, $"?clientId={clientId}&from=2026-02-01&to=2026-04-01");
        var untilFebruary = await HistoryAsync(admin, $"?clientId={clientId}&to=2026-02-01");

        Assert.Equal([march.Id], priced.Items.Select(q => q.Id));
        Assert.Equal([march.Id], february.Items.Select(q => q.Id));
        Assert.Equal([january.Id], untilFebruary.Items.Select(q => q.Id));
    }

    [Fact]
    public async Task History_IsPaged_WithTheTotalCount()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreateProductAsync();
        var (client, clientId) = await _factory.RegisterClientAsync();
        for (var i = 0; i < 3; i++)
        {
            await RequestQuoteAsync(client, product);
        }

        var firstPage = await HistoryAsync(admin, $"?clientId={clientId}&page=1&pageSize=2");
        var secondPage = await HistoryAsync(admin, $"?clientId={clientId}&page=2&pageSize=2");

        Assert.Equal(3, firstPage.TotalCount);
        Assert.Equal(2, firstPage.Items.Count);
        Assert.Equal(1, secondPage.Items.Count);
        Assert.Equal(2, secondPage.Page);
        Assert.Empty(firstPage.Items.Select(q => q.Id).Intersect(secondPage.Items.Select(q => q.Id)));
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?pageSize=0")]
    [InlineData("?from=2026-05-01&to=2026-04-01")]
    public async Task History_RefusesAnInvalidPageOrRange(string query)
    {
        var admin = await _factory.AdminAsync();

        var response = await admin.GetAsync($"/api/employee/quotes/history{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task History_IsForStaffOnly()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/employee/quotes/history")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/employee/quotes/history")).StatusCode);
    }
}
