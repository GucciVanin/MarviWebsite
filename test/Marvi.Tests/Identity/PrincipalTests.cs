using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Identity;

/// <summary>
/// Who the signed-in user is (MRV-4.7): the identity claims a login issues, and what every endpoint that reads them does.
/// One round trip per role: log in, then check what the endpoints make of the token.
/// </summary>
public class PrincipalTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public PrincipalTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static Dictionary<string, string> Claims(HttpClient signedIn)
    {
        var token = signedIn.DefaultRequestHeaders.Authorization!.Parameter!;
        return new JwtSecurityTokenHandler().ReadJwtToken(token).Claims
            .GroupBy(c => c.Type).ToDictionary(g => g.Key, g => g.First().Value);
    }

    private async Task<(HttpClient Client, Guid EmployeeId)> SignedInEmployeeAsync()
    {
        var admin = await _factory.AdminAsync();
        var email = $"{Guid.NewGuid()}@example.com";
        var created = await admin.PostAsJsonAsync("/api/admin/employees", new CreateEmployeeRequest(email, "Test1234!", $"E-{Guid.NewGuid():N}"[..20], "Sales", DateTime.UtcNow));
        created.EnsureSuccessStatusCode();
        var employeeId = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        return (await _factory.LoginAsync(email, "Test1234!"), employeeId);
    }

    private async Task<(HttpClient Admin, Guid ProductId)> PricedProductAsync()
    {
        var admin = await _factory.AdminAsync();
        await _factory.RegisterClientAsync(); // the default pricing tier is created on first registration
        var productId = await admin.CreateProductAsync();
        var tiers = await admin.GetFromJsonAsync<List<Marvi.Api.Features.Catalog.Contracts.PricingTierDto>>("/api/admin/pricing-tiers");
        (await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing",
            new Marvi.Api.Features.Catalog.Contracts.UpsertProductPricingRequest(tiers!.Single(t => t.IsDefault).Id, 10m, 1))).EnsureSuccessStatusCode();
        return (admin, productId);
    }

    // ---- the claims a login issues

    [Fact]
    public async Task ClientToken_CarriesTheUserIdTheRoleAndTheClientAccountId_Only()
    {
        var (client, accountId) = await _factory.RegisterClientAsync();

        var claims = Claims(client);

        Assert.Equal(accountId.ToString(), claims["client_id"]);
        Assert.Contains("Client", claims.Values);
        Assert.True(Guid.TryParse(claims["sub"], out _));
        Assert.DoesNotContain("employee_id", claims.Keys);
    }

    // The SPA reads the role from exactly this claim name (client/src/app/core/auth/auth.service.ts); the API must keep issuing it.
    [Theory]
    [InlineData("Client")]
    [InlineData("Employee")]
    [InlineData("Admin")]
    public async Task EveryToken_CarriesTheRoleUnderTheClaimNameTheBrowserReads(string role)
    {
        HttpClient signedIn = role switch
        {
            "Client" => (await _factory.RegisterClientAsync()).Client,
            "Employee" => (await SignedInEmployeeAsync()).Client,
            _ => await _factory.AdminAsync()
        };

        Assert.Equal(role, Claims(signedIn)["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"]);
    }

    [Fact]
    public async Task EmployeeToken_CarriesTheEmployeeAccountId_AndNoClientId()
    {
        var (employee, employeeId) = await SignedInEmployeeAsync();

        var claims = Claims(employee);

        Assert.Equal(employeeId.ToString(), claims["employee_id"]);
        Assert.Contains("Employee", claims.Values);
        Assert.DoesNotContain("client_id", claims.Keys);
    }

    [Fact]
    public async Task AdminToken_HasNeitherAnEmployeeNorAClientId()
    {
        var admin = await _factory.AdminAsync();

        var claims = Claims(admin);

        Assert.Contains("Admin", claims.Values);
        Assert.DoesNotContain("employee_id", claims.Keys);
        Assert.DoesNotContain("client_id", claims.Keys);
    }

    // ---- what the endpoints make of them

    [Fact]
    public async Task Customers_OnlySeeAndAcceptTheirOwnQuotes()
    {
        var (admin, productId) = await PricedProductAsync();
        var (a, _) = await _factory.RegisterClientAsync();
        var (b, _) = await _factory.RegisterClientAsync();
        var quote = (await (await a.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]))).Content.ReadFromJsonAsync<QuoteDto>())!;
        (await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price", new PriceQuoteRequest([new PriceQuoteLineRequest(quote.LineItems.Single().Id, 9m)]))).EnsureSuccessStatusCode();

        var bQuotes = await b.GetFromJsonAsync<List<QuoteDto>>("/api/quotes/mine");
        var bAccepts = await b.PostAsync($"/api/quotes/{quote.Id}/accept", null);
        var aOrders = await a.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine");

        Assert.DoesNotContain(bQuotes!, q => q.Id == quote.Id);
        Assert.Equal(HttpStatusCode.Forbidden, bAccepts.StatusCode);
        Assert.Empty(aOrders!);
    }

    [Fact]
    public async Task AnEmployee_IsRecordedAsThePricerAndThePlacer_AndAnAdminIsRecordedAsNobody()
    {
        var (admin, productId) = await PricedProductAsync();
        var (employee, employeeId) = await SignedInEmployeeAsync();
        var (client, accountId) = await _factory.RegisterClientAsync();
        var quote = (await (await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 1)]))).Content.ReadFromJsonAsync<QuoteDto>())!;

        var byEmployee = await employee.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price",
            new PriceQuoteRequest([new PriceQuoteLineRequest(quote.LineItems.Single().Id, 9m)]));
        var orderByEmployee = await employee.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(accountId, "1 Main St", [new EmployeeOrderLineItemRequest(productId, 1)]));
        var orderByAdmin = await admin.PostAsJsonAsync("/api/employee/orders",
            new CreateEmployeeOrderRequest(accountId, "1 Main St", [new EmployeeOrderLineItemRequest(productId, 1)]));

        Assert.Equal(employeeId, (await byEmployee.Content.ReadFromJsonAsync<QuoteDto>())!.PricedByEmployeeId);
        Assert.Equal(employeeId, (await orderByEmployee.Content.ReadFromJsonAsync<OrderDto>())!.PlacedByEmployeeId);
        Assert.Null((await orderByAdmin.Content.ReadFromJsonAsync<OrderDto>())!.PlacedByEmployeeId);
    }

    [Fact]
    public async Task EachRole_ReachesOnlyItsOwnEndpoints()
    {
        var (customer, _) = await _factory.RegisterClientAsync();
        var (employee, _) = await SignedInEmployeeAsync();
        var admin = await _factory.AdminAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync("/api/employee/quotes/queue")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/quotes/mine")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/admin/audit-log")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/employee/quotes/queue")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync("/api/employee/quotes/queue")).StatusCode);
    }

    [Fact]
    public async Task TheAuditLog_RecordsTheSignedInUser_AsTheActor()
    {
        var admin = await _factory.AdminAsync();
        var adminUserId = Guid.Parse(Claims(admin)["sub"]);
        var productId = await admin.CreateProductAsync();

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;

        Assert.Equal(adminUserId, Assert.Single(entries, e => e.EntityName == "Product" && e.EntityId == productId).ActorUserId);
    }

    [Fact]
    public async Task ACustomerWhoseAccountRecordIsMissing_IsRefused_NotServedSomeoneElsesData()
    {
        var email = $"{Guid.NewGuid()}@example.com";
        var register = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", TestAddresses.Main));
        var accountId = (await register.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.ClientAccounts.Remove((await db.ClientAccounts.FindAsync(accountId))!);
            await db.SaveChangesAsync();
        }

        var customer = await _factory.LoginAsync(email, "Test1234!");
        var response = await customer.GetAsync("/api/quotes/mine");

        Assert.DoesNotContain("client_id", Claims(customer).Keys);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
