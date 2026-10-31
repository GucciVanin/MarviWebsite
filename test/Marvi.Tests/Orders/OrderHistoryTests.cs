using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Domain.Orders;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Orders;

/// <summary>MRV-1.2b: an employee reads every order ever placed, paged and filterable; each order knows when it was placed.</summary>
public class OrderHistoryTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public OrderHistoryTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void Place_StampsTheOrderWithTheTimeItWasPlaced()
    {
        var before = DateTime.UtcNow;

        var order = OrderFactory.Place(Guid.NewGuid(), [new OrderLineInput(Guid.NewGuid(), 1, 5m)]);

        Assert.InRange(order.PlacedAt, before, DateTime.UtcNow);
        Assert.Equal(DateTimeKind.Utc, order.PlacedAt.Kind);
    }

    private static async Task<OrderDto> PlaceOrderAsync(HttpClient admin, Guid clientId, Guid productId)
    {
        var response = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(clientId, null, [new EmployeeOrderLineItemRequest(productId, 2)]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<OrderDto>())!;
    }

    private async Task SetPlacedAtAsync(Guid orderId, DateTime placedAt)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Orders.FindAsync(orderId))!.PlacedAt = placedAt;
        await db.SaveChangesAsync();
    }

    private static async Task<PagedResult<OrderHistoryItemDto>> HistoryAsync(HttpClient employee, string query)
    {
        var response = await employee.GetAsync($"/api/employee/orders/history{query}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PagedResult<OrderHistoryItemDto>>())!;
    }

    [Fact]
    public async Task History_ListsOrdersNewestFirst_ForTheChosenCustomerOnly_WithTheirPlacementTime()
    {
        var admin = await _factory.AdminAsync();
        var (_, aliceId) = await _factory.RegisterClientAsync();
        var (_, bobId) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var older = await PlaceOrderAsync(admin, aliceId, product);
        var newer = await PlaceOrderAsync(admin, aliceId, product);
        await PlaceOrderAsync(admin, bobId, product);
        await SetPlacedAtAsync(older.Id, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        await SetPlacedAtAsync(newer.Id, new DateTime(2026, 2, 1, 0, 0, 0, DateTimeKind.Utc));

        var history = await HistoryAsync(admin, $"?clientId={aliceId}");

        Assert.Equal(2, history.TotalCount);
        Assert.Equal([newer.Id, older.Id], history.Items.Select(o => o.Id));
        Assert.Equal(new DateTime(2026, 2, 1, 0, 0, 0, DateTimeKind.Utc), history.Items[0].PlacedAt);
        Assert.Equal(20m, history.Items[0].TotalAmount);
        Assert.All(history.Items, o => Assert.Equal("Acme Co", o.CompanyName));
        Assert.Single(history.Items[0].LineItems);
    }

    [Fact]
    public async Task History_FiltersByStatus_AndByDateRange_AndIsPaged()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var january = await PlaceOrderAsync(admin, clientId, product);
        var march = await PlaceOrderAsync(admin, clientId, product);
        var june = await PlaceOrderAsync(admin, clientId, product);
        await SetPlacedAtAsync(january.Id, new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc));
        await SetPlacedAtAsync(march.Id, new DateTime(2026, 3, 15, 0, 0, 0, DateTimeKind.Utc));
        await SetPlacedAtAsync(june.Id, new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc));

        var spring = await HistoryAsync(admin, $"?clientId={clientId}&from=2026-02-01&to=2026-04-01");
        var firstPage = await HistoryAsync(admin, $"?clientId={clientId}&page=1&pageSize=2");
        var secondPage = await HistoryAsync(admin, $"?clientId={clientId}&page=2&pageSize=2");
        var fulfilled = await HistoryAsync(admin, $"?clientId={clientId}&status=Fulfilled");
        var placed = await HistoryAsync(admin, $"?clientId={clientId}&status=Placed");

        Assert.Equal([march.Id], spring.Items.Select(o => o.Id));
        Assert.Equal(3, firstPage.TotalCount);
        Assert.Equal([june.Id, march.Id], firstPage.Items.Select(o => o.Id));
        Assert.Equal([january.Id], secondPage.Items.Select(o => o.Id));
        Assert.Empty(fulfilled.Items);
        Assert.Equal(3, placed.TotalCount);
    }

    [Theory]
    [InlineData("?status=99")]
    [InlineData("?page=0")]
    [InlineData("?pageSize=0")]
    [InlineData("?from=2026-05-01&to=2026-04-01")]
    public async Task History_RefusesAnInvalidPageOrRange(string query)
    {
        var admin = await _factory.AdminAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/employee/orders/history{query}")).StatusCode);
    }

    [Fact]
    public async Task History_IsForStaffOnly()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/employee/orders/history")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/employee/orders/history")).StatusCode);
    }
}
