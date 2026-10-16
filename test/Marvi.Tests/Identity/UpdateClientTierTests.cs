using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>MRV-1.3 / MRV-5.1: an admin moves a customer to another pricing tier without touching their status. There is no credit.</summary>
public class UpdateClientTierTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public UpdateClientTierTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<Guid> CreateTierAsync(HttpClient admin, string name)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(name, false));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PricingTierDto>())!.Id;
    }

    private static Task<HttpResponseMessage> UpdateAsync(HttpClient admin, Guid clientId, Guid tierId) =>
        admin.PutAsJsonAsync($"/api/admin/clients/{clientId}/pricing-tier", new UpdateClientTierRequest(tierId));

    private static async Task<ClientProfileDto> ProfileAsync(HttpClient admin, Guid clientId) =>
        (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{clientId}"))!;

    [Fact]
    public async Task Admin_ChangesTheTier_AndTheProfileShowsIt_WithoutChangingStatus()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");

        var response = await UpdateAsync(admin, clientId, gold);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var profile = await ProfileAsync(admin, clientId);
        Assert.StartsWith("Gold-", profile.PricingTierName);
        Assert.Equal(ClientAccountStatus.Approved, profile.Status);
    }

    [Fact]
    public async Task ASuspendedCustomer_CanBeMovedToAnotherTier_AndStaysSuspended()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");
        (await admin.PutAsync($"/api/admin/clients/{clientId}/suspend", null)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await UpdateAsync(admin, clientId, gold)).StatusCode);

        Assert.Equal(ClientAccountStatus.Suspended, (await ProfileAsync(admin, clientId)).Status);
    }

    [Fact]
    public async Task ChangingTheTier_ChangesThePricesTheCustomerIsQuoted()
    {
        var admin = await _factory.AdminAsync();
        var (client, clientId) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");
        (await admin.PutAsJsonAsync($"/api/admin/products/{product}/pricing", new UpsertProductPricingRequest(gold, 7m, 1))).EnsureSuccessStatusCode();

        async Task<decimal?> SuggestedAsync()
        {
            var created = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]));
            return (await created.Content.ReadFromJsonAsync<QuoteDto>())!.LineItems.Single().SuggestedUnitPrice;
        }

        Assert.Equal(10m, await SuggestedAsync());
        (await UpdateAsync(admin, clientId, gold)).EnsureSuccessStatusCode();
        Assert.Equal(7m, await SuggestedAsync());
    }

    [Fact]
    public async Task TheChange_IsAudited_WithThePreviousTier()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");

        (await UpdateAsync(admin, clientId, gold)).EnsureSuccessStatusCode();

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = Assert.Single(entries, e => e.EntityId == clientId && e.Action == "Update");
        Assert.Equal(nameof(ClientAccount), entry.EntityName);
        var details = System.Text.Json.JsonDocument.Parse(entry.Details["data"]).RootElement;
        Assert.Equal(gold, details.GetProperty("PricingTierId").GetGuid());
        Assert.NotEqual(gold, details.GetProperty("PreviousPricingTierId").GetGuid());
        Assert.False(details.TryGetProperty("CreditLimit", out _));
    }

    [Fact]
    public async Task Refuses_AnUnknownTier_AndAnUnknownCustomer()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");
        (await UpdateAsync(admin, clientId, gold)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.BadRequest, (await UpdateAsync(admin, clientId, Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await UpdateAsync(admin, Guid.NewGuid(), gold)).StatusCode);

        // The refused requests changed nothing.
        Assert.StartsWith("Gold-", (await ProfileAsync(admin, clientId)).PricingTierName);
    }

    [Fact]
    public async Task OldCreditEndpoint_IsGone()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();

        var response = await admin.PutAsJsonAsync($"/api/admin/clients/{clientId}/update-credit", new { pricingTierId = Guid.NewGuid(), creditLimit = 1 });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task IsForAdminsOnly()
    {
        var (client, clientId) = await _factory.RegisterClientAsync();
        var admin = await _factory.AdminAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");

        Assert.Equal(HttpStatusCode.Forbidden, (await UpdateAsync(client, clientId, gold)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await UpdateAsync(_factory.CreateClient(), clientId, gold)).StatusCode);
    }
}
