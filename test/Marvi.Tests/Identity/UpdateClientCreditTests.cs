using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>MRV-1.3: an admin changes a customer's credit limit and pricing tier without touching their status.</summary>
public class UpdateClientCreditTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public UpdateClientCreditTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<Guid> CreateTierAsync(HttpClient admin, string name)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(name, false));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PricingTierDto>())!.Id;
    }

    private static Task<HttpResponseMessage> UpdateAsync(HttpClient admin, Guid clientId, Guid tierId, decimal credit) =>
        admin.PutAsJsonAsync($"/api/admin/clients/{clientId}/update-credit", new UpdateClientCreditRequest(tierId, credit));

    private static async Task<ClientProfileDto> ProfileAsync(HttpClient admin, Guid clientId) =>
        (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{clientId}"))!;

    [Fact]
    public async Task Admin_ChangesCreditAndTier_AndTheProfileShowsIt_WithoutChangingStatus()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");

        var response = await UpdateAsync(admin, clientId, gold, 2500m);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var profile = await ProfileAsync(admin, clientId);
        Assert.Equal(2500m, profile.CreditLimit);
        Assert.StartsWith("Gold-", profile.PricingTierName);
        Assert.Equal(ClientAccountStatus.Approved, profile.Status);
    }

    [Fact]
    public async Task ASuspendedCustomer_CanHaveItsCreditAdjusted_AndStaysSuspended()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");
        (await admin.PutAsync($"/api/admin/clients/{clientId}/suspend", null)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NoContent, (await UpdateAsync(admin, clientId, gold, 10m)).StatusCode);

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
        (await UpdateAsync(admin, clientId, gold, 0m)).EnsureSuccessStatusCode();
        Assert.Equal(7m, await SuggestedAsync());
    }

    [Fact]
    public async Task TheChange_IsAudited()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");

        (await UpdateAsync(admin, clientId, gold, 1500m)).EnsureSuccessStatusCode();

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = Assert.Single(entries, e => e.EntityId == clientId && e.Action == "Update");
        Assert.Equal(nameof(ClientAccount), entry.EntityName);
        var details = System.Text.Json.JsonDocument.Parse(entry.Details["data"]).RootElement;
        Assert.Equal(1500m, details.GetProperty("CreditLimit").GetDecimal());
        Assert.Equal(gold, details.GetProperty("PricingTierId").GetGuid());
        Assert.Equal(0m, details.GetProperty("PreviousCreditLimit").GetDecimal());
        Assert.NotEqual(gold, details.GetProperty("PreviousPricingTierId").GetGuid());
    }

    [Fact]
    public async Task Refuses_ANegativeCredit_AnUnknownTier_AndAnUnknownCustomer()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");
        (await UpdateAsync(admin, clientId, gold, 300m)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.BadRequest, (await UpdateAsync(admin, clientId, gold, -1m)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await UpdateAsync(admin, clientId, Guid.NewGuid(), 5m)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await UpdateAsync(admin, Guid.NewGuid(), gold, 5m)).StatusCode);

        // Refused requests changed nothing.
        Assert.Equal(300m, (await ProfileAsync(admin, clientId)).CreditLimit);
    }

    [Fact]
    public async Task IsForAdminsOnly()
    {
        var (client, clientId) = await _factory.RegisterClientAsync();
        var admin = await _factory.AdminAsync();
        var gold = await CreateTierAsync(admin, $"Gold-{Guid.NewGuid():N}");

        Assert.Equal(HttpStatusCode.Forbidden, (await UpdateAsync(client, clientId, gold, 1m)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await UpdateAsync(_factory.CreateClient(), clientId, gold, 1m)).StatusCode);
    }
}
