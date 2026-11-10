using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Marvi.Tests.Identity;

/// <summary>
/// MRV-9.9: a Suspended customer cannot sign in, and a token they already hold stops working (within 60 seconds at most, at once when an admin
/// suspends them through this API). The sign-in answer must not reveal which e-mails are suspended.
/// </summary>
public class SuspendedCustomerTests : IClassFixture<SuspendedCustomerTests.ClockedFactory>
{
    private readonly ClockedFactory _factory;

    public SuspendedCustomerTests(ClockedFactory factory) => _factory = factory;

    private static LoginRequest Login(string email, string password) => new(email, password);

    private static async Task<(string Email, Guid Id)> RegisterAsync(MarviApiFactory factory)
    {
        var email = $"{Guid.NewGuid()}@example.com";
        var register = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", TestAddresses.Main));
        register.EnsureSuccessStatusCode();
        var id = (await register.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        return (email, id);
    }

    private static async Task<(string Body, HttpStatusCode Status, string[] Headers)> SignInAsync(MarviApiFactory factory, string email, string password)
    {
        var response = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", Login(email, password));
        var headers = response.Headers.Select(h => h.Key).Concat(response.Content.Headers.Select(h => h.Key)).Order().ToArray();
        // The problem-details body carries a per-request trace id; everything else must be identical.
        return (System.Text.RegularExpressions.Regex.Replace(await response.Content.ReadAsStringAsync(), "\"traceId\":\"[^\"]*\"", "\"traceId\":\"-\""), response.StatusCode, headers);
    }

    private static async Task<HttpResponseMessage> GetAsync(HttpClient client, string url)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        return await client.SendAsync(request);
    }

    // ---- AC-1

    [Fact]
    public async Task ASuspendedCustomer_WithTheRightPassword_Gets403AndTheMessage_AndNoToken()
    {
        var (email, id) = await RegisterAsync(_factory);
        await _factory.SetClientStatusAsync(id, ClientAccountStatus.Suspended);

        var (body, status, _) = await SignInAsync(_factory, email, "Test1234!");

        Assert.Equal(HttpStatusCode.Forbidden, status);
        using var json = JsonDocument.Parse(body);
        Assert.Equal("account_suspended", json.RootElement.GetProperty("code").GetString());
        Assert.Equal("Sua conta está suspensa. Entre em contato com a empresa.", json.RootElement.GetProperty("message").GetString());
        Assert.False(json.RootElement.TryGetProperty("token", out _));
        Assert.DoesNotContain("eyJ", body);
    }

    [Fact]
    public async Task AWrongPassword_ForASuspendedCustomer_IsIndistinguishableFromAnyOtherWrongPassword()
    {
        var (suspendedEmail, suspendedId) = await RegisterAsync(_factory);
        var (approvedEmail, _) = await RegisterAsync(_factory);
        await _factory.SetClientStatusAsync(suspendedId, ClientAccountStatus.Suspended);

        var suspended = await SignInAsync(_factory, suspendedEmail, "Wrong-Password-1!");
        var pendingWrong = await SignInAsync(_factory, approvedEmail, "Wrong-Password-1!");
        var unknown = await SignInAsync(_factory, $"{Guid.NewGuid()}@example.com", "Wrong-Password-1!");

        Assert.Equal(HttpStatusCode.Unauthorized, suspended.Status);
        Assert.Equal(pendingWrong.Status, suspended.Status);
        Assert.Equal(pendingWrong.Body, suspended.Body);
        Assert.Equal(pendingWrong.Headers, suspended.Headers);
        Assert.Equal(unknown.Status, suspended.Status);
        Assert.Equal(unknown.Body, suspended.Body);
        Assert.DoesNotContain("account_suspended", suspended.Body);
    }

    [Fact]
    public async Task PendingCustomers_EmployeesAndAdmins_StillSignIn()
    {
        var (pendingEmail, _) = await RegisterAsync(_factory);
        var admin = await _factory.AdminAsync();
        var employeeEmail = $"{Guid.NewGuid()}@example.com";
        (await admin.PostAsJsonAsync("/api/admin/employees",
            new CreateEmployeeRequest(employeeEmail, "Test1234!", $"E-{Guid.NewGuid():N}"[..20], "Sales", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)))).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.OK, (await SignInAsync(_factory, pendingEmail, "Test1234!")).Status);
        Assert.Equal(HttpStatusCode.OK, (await SignInAsync(_factory, employeeEmail, "Test1234!")).Status);
        Assert.Equal(HttpStatusCode.OK, (await SignInAsync(_factory, MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword)).Status);
    }

    [Fact]
    public async Task SuspendThenApprove_ThroughTheAdminApi_TakesAwayAndGivesBackSignIn_AtOnce_Audited()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var email = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!.ContactEmail!;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/client/profile")).StatusCode); // cached as Approved

        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Forbidden, (await SignInAsync(_factory, email, "Test1234!")).Status);
        var refused = await client.GetAsync("/api/client/profile"); // the same token, no time has passed
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Contains("account_suspended", await refused.Content.ReadAsStringAsync());

        var tiers = (await admin.GetFromJsonAsync<List<Marvi.Api.Features.Catalog.Contracts.PricingTierDto>>("/api/admin/pricing-tiers"))!;
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/approve", new ApproveClientRequest(tiers.Single(t => t.IsDefault).Id))).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.OK, (await SignInAsync(_factory, email, "Test1234!")).Status);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/client/profile")).StatusCode); // the old token works again
        var entries = (await admin.GetFromJsonAsync<List<Marvi.Api.Features.Auditing.Contracts.AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        Assert.Single(entries, e => e.EntityId == id && e.Action == "Suspend");
        Assert.Equal(2, entries.Count(e => e.EntityId == id && e.Action == "Approve"));
    }

    // ---- AC-2: the 60 second window, on a clock the test moves

    [Fact]
    public async Task AChangeMadeBehindTheApisBack_TakesEffectWithin60Seconds_NotBefore()
    {
        var (client, id) = await _factory.RegisterClientAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/client/profile")).StatusCode);

        // Written straight into the database, as a second replica would: this process is not told.
        await ChangeStatusWithoutTellingTheCacheAsync(id, ClientAccountStatus.Suspended);

        _factory.Clock.Advance(TimeSpan.FromSeconds(59));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/client/profile")).StatusCode);
        _factory.Clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/client/profile")).StatusCode);

        // And the other way round: reinstated behind the API's back, the person is let in again within the same window.
        await ChangeStatusWithoutTellingTheCacheAsync(id, ClientAccountStatus.Approved);
        _factory.Clock.Advance(TimeSpan.FromSeconds(59));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/client/profile")).StatusCode);
        _factory.Clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/client/profile")).StatusCode);
    }

    [Fact]
    public async Task ApprovedAndPendingTokens_AreNotAffected_AndNeitherAreEmployeeOrAdminTokens()
    {
        var admin = await _factory.AdminAsync();
        var (approved, _) = await _factory.RegisterClientAsync();
        var (pending, _) = await _factory.RegisterPendingClientAsync();
        var employeeEmail = $"{Guid.NewGuid()}@example.com";
        (await admin.PostAsJsonAsync("/api/admin/employees",
            new CreateEmployeeRequest(employeeEmail, "Test1234!", $"E-{Guid.NewGuid():N}"[..20], "Sales", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)))).EnsureSuccessStatusCode();
        var employee = await _factory.LoginAsync(employeeEmail, "Test1234!");
        var (_, suspendedId) = await _factory.RegisterClientAsync();
        (await admin.PutAsync($"/api/admin/clients/{suspendedId}/suspend", null)).EnsureSuccessStatusCode();

        _factory.Clock.Advance(TimeSpan.FromMinutes(5));

        Assert.Equal(HttpStatusCode.OK, (await approved.GetAsync("/api/client/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await pending.GetAsync("/api/client/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync("/api/employee/clients")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/pending-actions")).StatusCode);
    }

    [Fact]
    public async Task ASuspendedCustomersToken_ReachesNeitherTheApiNorTheCatalogue_ButTheSignInEndpointsStayOpen()
    {
        var (email, id) = await RegisterAsync(_factory);
        var client = await _factory.LoginAsync(email, "Test1234!");
        await _factory.SetClientStatusAsync(id, ClientAccountStatus.Suspended);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/quotes/mine")).StatusCode);
        // The sign-in and registration paths carry no session: another person can sign in from a browser that still holds the old token.
        var (otherEmail, _) = await RegisterAsync(_factory);
        var response = await client.PostAsJsonAsync("/api/auth/login", Login(otherEmail, "Test1234!"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task TheCache_KeepsWhatItReadUntilItExpiresOrIsInvalidated()
    {
        var cache = new ClientStatusCache(new ManualTime());
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var (_, id) = await RegisterAsync(_factory);

        Assert.Equal(ClientAccountStatus.Pending, await cache.GetStatusAsync(id, db));
        await _factory.SetClientStatusAsync(id, ClientAccountStatus.Suspended);
        Assert.Equal(ClientAccountStatus.Pending, await cache.GetStatusAsync(id, db)); // cached, nobody invalidated this instance
        cache.Invalidate(id);
        Assert.Equal(ClientAccountStatus.Suspended, await cache.GetStatusAsync(id, db));
        Assert.Null(await cache.GetStatusAsync(Guid.NewGuid(), db)); // no such account: not suspended, not an error
    }

    // ---- O-4: defence in depth. Inside the 60 s window a stale cache lets the request past the gate; the inner Suspended rules must still refuse.

    [Fact]
    public async Task InsideTheStaleWindow_TheProfileControllersOwnSuspendedRule_StillRefuses_AndAfterItTheGateDoes()
    {
        var (client, id) = await _factory.RegisterClientAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/client/profile")).StatusCode); // cached as Approved
        await ChangeStatusWithoutTellingTheCacheAsync(id, ClientAccountStatus.Suspended);

        var renamed = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme Renamed", null, null));

        Assert.Equal(HttpStatusCode.Forbidden, renamed.StatusCode); // the gate was bypassed: this is the controller's locked-field branch
        Assert.DoesNotContain("account_suspended", await renamed.Content.ReadAsStringAsync());

        _factory.Clock.Advance(ClientStatusCache.Lifetime);
        var gated = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme Renamed", null, null));
        Assert.Equal(HttpStatusCode.Forbidden, gated.StatusCode);
        Assert.Contains("account_suspended", await gated.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task InsideTheStaleWindow_TheQuoteRules_StillRefuseASuspendedCustomer_WithTheirOwnMessage()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var created = await client.PostAsJsonAsync("/api/quotes", new Marvi.Api.Features.Quotes.Contracts.CreateQuoteRequest([new Marvi.Api.Features.Quotes.Contracts.QuoteLineItemRequest(product, 1)]));
        created.EnsureSuccessStatusCode(); // also caches the customer as Approved
        await ChangeStatusWithoutTellingTheCacheAsync(id, ClientAccountStatus.Suspended);

        var request = await client.PostAsJsonAsync("/api/quotes", new Marvi.Api.Features.Quotes.Contracts.CreateQuoteRequest([new Marvi.Api.Features.Quotes.Contracts.QuoteLineItemRequest(product, 1)]));
        var accept = await client.PostAsync($"/api/quotes/{Guid.NewGuid()}/accept", null);

        Assert.Equal(HttpStatusCode.Forbidden, request.StatusCode);
        Assert.Equal("Client account is not active.", await request.Content.ReadAsStringAsync());
        Assert.True(accept.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound); // never a success
        Assert.DoesNotContain("account_suspended", await request.Content.ReadAsStringAsync());

        _factory.Clock.Advance(ClientStatusCache.Lifetime);
        Assert.Contains("account_suspended", await (await client.PostAsJsonAsync("/api/quotes", new Marvi.Api.Features.Quotes.Contracts.CreateQuoteRequest([new Marvi.Api.Features.Quotes.Contracts.QuoteLineItemRequest(product, 1)]))).Content.ReadAsStringAsync());
    }

    // ---- O-4: fail closed. A status lookup that fails must never let the request through, and must leave nothing cached.

    [Fact]
    public async Task AFailingStatusLookup_InTheGate_Answers500_NeverLetsTheRequestThrough()
    {
        using var factory = new ThrowingFactory();
        var (client, _) = await factory.RegisterClientAsync(); // sign-in does not use the cache
        factory.Cache.Fail = true;

        var response = await client.GetAsync("/api/client/profile");
        var catalogue = await client.GetAsync("/api/products");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError, catalogue.StatusCode);
        Assert.DoesNotContain("InvalidOperation", await response.Content.ReadAsStringAsync()); // generic body, no detail
        // Visitors, employees and admins never reach the lookup, so they are not affected.
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().GetAsync("/api/products")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await (await factory.AdminAsync()).GetAsync("/api/admin/pending-actions")).StatusCode);
        factory.Cache.Fail = false;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/client/profile")).StatusCode);
    }

    [Fact]
    public async Task AFailingDatabaseRead_ThrowsOutOfTheCache_AndCachesNothing()
    {
        var cache = new ClientStatusCache(new ManualTime());
        var (_, id) = await RegisterAsync(_factory);
        using var scope = _factory.Services.CreateScope();
        var broken = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await broken.DisposeAsync(); // every query on it throws

        await Assert.ThrowsAnyAsync<Exception>(() => cache.GetStatusAsync(id, broken));

        var entries = (System.Collections.IDictionary)typeof(ClientStatusCache).GetField("_entries", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(cache)!;
        Assert.Empty(entries);
    }

    // ---- AC-6: the rate limit is the one that was there

    [Fact]
    public async Task TheSuspendedAnswer_UsesTheSameSignInBudgetAsAWrongPassword()
    {
        using var factory = new RateLimitingTests.TightLimitsFactory(); // three sign-ins a minute
        var (email, id) = await RegisterAsync(factory);
        await factory.SetClientStatusAsync(id, ClientAccountStatus.Suspended);

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await SignInAsync(factory, email, "Test1234!")).Status);
        }

        var limited = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", Login(email, "Test1234!"));
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    private async Task ChangeStatusWithoutTellingTheCacheAsync(Guid id, ClientAccountStatus status)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.ClientAccounts.FindAsync(id))!.Status = status;
        await db.SaveChangesAsync();
    }

    /// <summary>A clock that only moves when a test moves it.</summary>
    public sealed class ManualTime : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 11, 3, 12, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }

    /// <summary>A status cache whose lookup can be made to fail, to prove the gate fails closed.</summary>
    public sealed class SwitchableCache() : ClientStatusCache(TimeProvider.System)
    {
        public bool Fail { get; set; }

        public override Task<ClientAccountStatus?> GetStatusAsync(Guid clientAccountId, AppDbContext dbContext, CancellationToken cancellationToken = default) =>
            Fail ? throw new InvalidOperationException("status lookup failed") : base.GetStatusAsync(clientAccountId, dbContext, cancellationToken);
    }

    public sealed class ThrowingFactory : MarviApiFactory
    {
        public SwitchableCache Cache { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<ClientStatusCache>();
                services.AddSingleton<ClientStatusCache>(Cache);
            });
        }
    }

    public sealed class ClockedFactory : MarviApiFactory
    {
        public ManualTime Clock { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(Clock);
            });
        }
    }
}
