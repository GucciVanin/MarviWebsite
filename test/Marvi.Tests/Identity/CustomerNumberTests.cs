using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Admin.Contracts;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Auditing;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Identity;

/// <summary>
/// MRV-9.1: customers, quotes and orders carry a short number the database hands out once, and a customer can be fetched by it.
/// (The migration that numbers existing rows is checked on real Postgres by test/runtime/migration-numbering.sh and the runtime suite.)
/// </summary>
public class CustomerNumberTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CustomerNumberTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<T> OkAsync<T>(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<ClientProfileDto> ProfileAsync(HttpClient staff, Guid id) =>
        await OkAsync<ClientProfileDto>(await staff.GetAsync($"/api/employee/clients/{id}"));

    private static async Task<List<PricingTierDto>> TiersAsync(HttpClient admin) =>
        (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!;

    [Fact]
    public async Task EveryNewCustomer_GetsAPositiveNumber_NoOtherCustomerHas_InRegistrationOrder()
    {
        var admin = await _factory.AdminAsync();
        var numbers = new List<int>();
        for (var i = 0; i < 3; i++)
        {
            var (_, id) = await _factory.RegisterPendingClientAsync();
            numbers.Add((await ProfileAsync(admin, id)).CustomerNumber);
        }

        Assert.All(numbers, n => Assert.True(n > 0));
        Assert.Equal(3, numbers.Distinct().Count());
        Assert.Equal(numbers.Order().ToList(), numbers);
        var everyone = await OkAsync<PagedResult<ClientSummaryDto>>(await admin.GetAsync("/api/employee/clients?pageSize=100"));
        Assert.Equal(everyone.Items.Count, everyone.Items.Select(c => c.CustomerNumber).Distinct().Count());
    }

    [Fact]
    public async Task TheNumber_IsTheSameEverywhereACustomerIsNamed_AndNeverChanges()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await _factory.RegisterPendingClientAsync();
        var number = (await ProfileAsync(admin, id)).CustomerNumber;
        Assert.Equal(number, (await OkAsync<ClientOwnProfileDto>(await customer.GetAsync("/api/client/profile"))).CustomerNumber);

        // Editing the profile, approving and changing the tier leave it alone.
        (await customer.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Renamed Ltda"))).EnsureSuccessStatusCode();
        var tiers = await TiersAsync(admin);
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/approve", new ApproveClientRequest(tiers[0].Id))).EnsureSuccessStatusCode();
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/pricing-tier", new UpdateClientTierRequest(tiers[^1].Id))).EnsureSuccessStatusCode();

        Assert.Equal(number, (await ProfileAsync(admin, id)).CustomerNumber);
        Assert.Equal(number, (await OkAsync<ClientOwnProfileDto>(await customer.GetAsync("/api/client/profile"))).CustomerNumber);
        var found = await OkAsync<PagedResult<ClientSummaryDto>>(await admin.GetAsync("/api/employee/clients?search=Renamed"));
        Assert.Equal(number, Assert.Single(found.Items, c => c.Id == id).CustomerNumber);
    }

    [Fact]
    public async Task StaffSeeTheCustomersLoginEmail_ByIdAndByNumber_ButTheCustomerNeverGetsItFromAStaffRoute()
    {
        var admin = await _factory.AdminAsync();
        var email = $"{Guid.NewGuid()}@contato.example.com";
        var register = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", TestAddresses.Main));
        register.EnsureSuccessStatusCode();
        var id = (await register.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        var customer = await _factory.LoginAsync(email, "Test1234!");

        var byId = await ProfileAsync(admin, id);
        var byNumber = await OkAsync<ClientProfileDto>(await admin.GetAsync($"/api/employee/clients/by-number/{byId.CustomerNumber}"));

        Assert.Equal(email, byId.ContactEmail);
        Assert.Equal(email, byNumber.ContactEmail);
        // Another customer cannot read it: both staff routes refuse them.
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync($"/api/employee/clients/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync($"/api/employee/clients/by-number/{byId.CustomerNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync($"/api/employee/clients/{id}")).StatusCode);
        // The customer's own profile has no e-mail field of its own to leak anything else.
        Assert.DoesNotContain("ContactEmail", await customer.GetStringAsync("/api/client/profile"), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ByNumber_ReturnsTheSameBodyAsById()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterPendingClientAsync();
        var byId = await ProfileAsync(admin, id);

        var response = await admin.GetAsync($"/api/employee/clients/by-number/{byId.CustomerNumber}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(await admin.GetStringAsync($"/api/employee/clients/{id}"), await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("999999999", HttpStatusCode.NotFound)]
    [InlineData("0", HttpStatusCode.NotFound)]
    [InlineData("99999999999999999999", HttpStatusCode.NotFound)]
    [InlineData("abc", HttpStatusCode.BadRequest)]
    [InlineData("C-000042", HttpStatusCode.BadRequest)]
    [InlineData("-5", HttpStatusCode.BadRequest)]
    [InlineData("4.2", HttpStatusCode.BadRequest)]
    [InlineData("%2042", HttpStatusCode.BadRequest)]
    public async Task ByNumber_AnswersNotFoundForAnUnknownNumber_AndBadRequestForOneThatIsNotDigits(string number, HttpStatusCode expected)
    {
        var admin = await _factory.AdminAsync();

        Assert.Equal(expected, (await admin.GetAsync($"/api/employee/clients/by-number/{number}")).StatusCode);
        Assert.Equal(expected, (await admin.GetAsync($"/api/admin/customers/by-number/{number}")).StatusCode);
    }

    [Fact]
    public async Task ByNumber_RefusesAnonymousVisitorsAndCustomers()
    {
        var (customer, _) = await _factory.RegisterClientAsync();
        var anonymous = _factory.CreateClient();

        foreach (var url in new[] { "/api/employee/clients/by-number/1", "/api/admin/customers/by-number/1" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync(url)).StatusCode);
        }
    }

    [Fact]
    public async Task TheAdminByNumberEndpoint_ReturnsTheLineTheCustomersTabShows()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterClientAsync();
        var number = (await ProfileAsync(admin, id)).CustomerNumber;

        var line = await OkAsync<ClientSummaryDto>(await admin.GetAsync($"/api/admin/customers/by-number/{number}"));

        Assert.Equal(id, line.Id);
        Assert.Equal(number, line.CustomerNumber);
        Assert.Equal("Acme Co", line.CompanyName);
        Assert.Equal("Standard", line.PricingTierName);
    }

    [Fact]
    public async Task QuotesAndOrders_GetTheirOwnNumbers_AndNameTheCustomer()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var (customer, clientId) = await _factory.RegisterClientAsync();
        var customerNumber = (await ProfileAsync(admin, clientId)).CustomerNumber;
        var first = await OkAsync<QuoteDto>(await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)])));
        var second = await OkAsync<QuoteDto>(await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)])));

        Assert.True(first.Number > 0);
        Assert.True(second.Number > first.Number);
        Assert.Equal(customerNumber, first.CustomerNumber);
        Assert.Equal("Acme Co", first.CompanyName);

        var queue = await OkAsync<List<QuoteDto>>(await admin.GetAsync("/api/employee/quotes/queue"));
        var inQueue = Assert.Single(queue, q => q.Id == first.Id);
        Assert.Equal((first.Number, customerNumber, "Acme Co"), (inQueue.Number, inQueue.CustomerNumber, inQueue.CompanyName));
        var mine = await OkAsync<List<QuoteDto>>(await customer.GetAsync("/api/quotes/mine"));
        Assert.Equal([first.Number, second.Number], mine.Select(q => q.Number).Order());
        var history = await OkAsync<PagedResult<QuoteHistoryItemDto>>(await admin.GetAsync($"/api/employee/quotes/history?clientId={clientId}"));
        Assert.All(history.Items, q => Assert.Equal(customerNumber, q.CustomerNumber));
        var priced = await OkAsync<QuoteDto>(await admin.PutAsJsonAsync($"/api/employee/quotes/{first.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(first.LineItems.Single().Id, 9m)])));
        Assert.Equal((first.Number, customerNumber), (priced.Number, priced.CustomerNumber));

        var accepted = await OkAsync<OrderDto>(await customer.PostAsync($"/api/quotes/{first.Id}/accept", null));
        var placed = await OkAsync<OrderDto>(await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(clientId, null, [new EmployeeOrderLineItemRequest(product, 1)])));
        Assert.True(accepted.Number > 0);
        Assert.True(placed.Number > accepted.Number);
        Assert.All(new[] { accepted, placed }, o => Assert.Equal((customerNumber, "Acme Co"), (o.CustomerNumber, o.CompanyName)));
        var orders = await OkAsync<List<OrderDto>>(await customer.GetAsync("/api/orders/mine"));
        Assert.Equal([accepted.Number, placed.Number], orders.Select(o => o.Number).Order());
        var orderHistory = await OkAsync<PagedResult<OrderHistoryItemDto>>(await admin.GetAsync($"/api/employee/orders/history?clientId={clientId}"));
        Assert.All(orderHistory.Items, o => Assert.Equal(customerNumber, o.CustomerNumber));
        var profile = await ProfileAsync(admin, clientId);
        Assert.Equal(2, profile.Quotes.Select(q => q.Number).Distinct().Count());
        Assert.All(profile.Quotes, q => Assert.Equal(customerNumber, q.CustomerNumber));
        Assert.All(profile.Orders, o => Assert.Equal(customerNumber, o.CustomerNumber));
    }

    [Fact]
    public async Task TheAdminInbox_NamesPendingCustomersAndQuotesByNumber()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var (_, pendingId) = await _factory.RegisterPendingClientAsync();
        var (customer, clientId) = await _factory.RegisterClientAsync();
        var quote = await OkAsync<QuoteDto>(await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)])));

        var inbox = await OkAsync<PendingActionsDto>(await admin.GetAsync("/api/admin/pending-actions"));

        Assert.Equal((await ProfileAsync(admin, pendingId)).CustomerNumber, inbox.Customers.Items.Single(c => c.Id == pendingId).CustomerNumber);
        var line = inbox.Quotes.Items.Single(q => q.Id == quote.Id);
        Assert.Equal((quote.Number, (await ProfileAsync(admin, clientId)).CustomerNumber), (line.Number, line.CustomerNumber));
    }

    [Fact]
    public async Task TheAuditLog_GivesTheNumberOfACustomerQuoteOrOrder_AndNothingForOtherEntities()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var (customer, clientId) = await _factory.RegisterPendingClientAsync();
        var tiers = await TiersAsync(admin);
        (await admin.PutAsJsonAsync($"/api/admin/clients/{clientId}/approve", new ApproveClientRequest(tiers[0].Id))).EnsureSuccessStatusCode();
        var quote = await OkAsync<QuoteDto>(await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)])));
        var order = await OkAsync<OrderDto>(await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(clientId, null, [new EmployeeOrderLineItemRequest(product, 1)])));
        var missing = Guid.NewGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var when = DateTime.UtcNow.AddMinutes(5);
            db.AuditLogEntries.AddRange(
                new AuditLogEntry { Id = Guid.NewGuid(), ActorUserId = Guid.NewGuid(), Action = "Update", EntityName = "Quote", EntityId = quote.Id, Timestamp = when },
                new AuditLogEntry { Id = Guid.NewGuid(), ActorUserId = Guid.NewGuid(), Action = "Update", EntityName = "Order", EntityId = order.Id, Timestamp = when },
                new AuditLogEntry { Id = Guid.NewGuid(), ActorUserId = Guid.NewGuid(), Action = "Update", EntityName = "Quote", EntityId = missing, Timestamp = when });
            await db.SaveChangesAsync();
        }

        var entries = await OkAsync<List<AuditLogEntryDto>>(await admin.GetAsync("/api/admin/audit-log?pageSize=200"));

        Assert.Equal((await ProfileAsync(admin, clientId)).CustomerNumber, entries.Single(e => e.EntityName == "ClientAccount" && e.EntityId == clientId).EntityNumber);
        Assert.Equal(quote.Number, entries.Single(e => e.EntityName == "Quote" && e.EntityId == quote.Id).EntityNumber);
        Assert.Equal(order.Number, entries.Single(e => e.EntityName == "Order" && e.EntityId == order.Id).EntityNumber);
        Assert.Null(entries.Single(e => e.EntityId == missing).EntityNumber);
        Assert.All(entries.Where(e => e.EntityName is not ("ClientAccount" or "Quote" or "Order")), e => Assert.Null(e.EntityNumber));
    }
}
