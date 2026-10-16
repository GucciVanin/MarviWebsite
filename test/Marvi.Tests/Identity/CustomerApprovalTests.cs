using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>MRV-5.3: least privilege. A new customer is Pending and can do nothing but manage their own details until an admin approves them with an explicit tier.</summary>
public class CustomerApprovalTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CustomerApprovalTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static Task<HttpResponseMessage> ApproveAsync(HttpClient admin, Guid clientId, Guid tierId) =>
        admin.PutAsJsonAsync($"/api/admin/clients/{clientId}/approve", new ApproveClientRequest(tierId));

    private static async Task<Guid> CreateTierAsync(HttpClient admin)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest($"Tier-{Guid.NewGuid():N}", false));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PricingTierDto>())!.Id;
    }

    [Fact]
    public async Task ANewCustomer_IsPending_AndCanOnlyManageTheirOwnDetails()
    {
        var (customer, _) = await _factory.RegisterPendingClientAsync();

        var profile = (await customer.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;
        var edited = await customer.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Nova Ltda", "Rua A, 1", ["Rua B, 2"]));

        Assert.Equal(ClientAccountStatus.Pending, profile.Status);
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
    }

    [Fact]
    public async Task APendingCustomer_CannotRequestQuotesOrAcceptThem_UntilApproved()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await _factory.RegisterPendingClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);

        var refused = await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]));
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);

        var tier = await CreateTierAsync(admin);
        Assert.Equal(HttpStatusCode.NoContent, (await ApproveAsync(admin, id, tier)).StatusCode);

        var allowed = await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]));
        Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
    }

    [Fact]
    public async Task APendingCustomer_CannotAcceptAQuoteOrBeGivenAnOrder()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await _factory.RegisterPendingClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);

        var order = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, "1 Main St", [new EmployeeOrderLineItemRequest(product, 1)]));
        var accept = await customer.PostAsync($"/api/quotes/{Guid.NewGuid()}/accept", null);

        Assert.Equal(HttpStatusCode.Forbidden, order.StatusCode);
        Assert.NotEqual(HttpStatusCode.Created, accept.StatusCode);
    }

    [Fact]
    public async Task APendingCustomer_SeesNoBetterPricesThanAnAnonymousVisitor()
    {
        var admin = await _factory.AdminAsync();
        var (customer, _) = await _factory.RegisterPendingClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);

        var seenByCustomer = (await customer.GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!.Single(p => p.Id == product).Price;
        var seenByVisitor = (await _factory.CreateClient().GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!.Single(p => p.Id == product).Price;

        Assert.Equal(seenByVisitor, seenByCustomer);
    }

    [Fact]
    public async Task ASuspendedCustomer_LosesTheirNegotiatedPrices_AndSeesWhatAVisitorSees()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var gold = await CreateTierAsync(admin);
        (await admin.PutAsJsonAsync($"/api/admin/products/{product}/pricing", new UpsertProductPricingRequest(gold, 6m, 1))).EnsureSuccessStatusCode();
        (await ApproveAsync(admin, id, gold)).EnsureSuccessStatusCode();
        Assert.Equal(6m, (await customer.GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!.Single(p => p.Id == product).Price);

        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();

        Assert.Equal(10m, (await customer.GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!.Single(p => p.Id == product).Price);
        Assert.Equal(10m, (await customer.GetFromJsonAsync<ProductDetailDto>($"/api/products/{product}"))!.Price);
    }

    [Fact]
    public async Task Approving_NeedsAnExplicitTier_NobodyIsApprovedByDefault()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await _factory.RegisterPendingClientAsync();

        var noTier = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/approve", new { });
        var unknownTier = await ApproveAsync(admin, id, Guid.NewGuid());

        Assert.Equal(HttpStatusCode.BadRequest, noTier.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, unknownTier.StatusCode);
        Assert.Equal(ClientAccountStatus.Pending, (await customer.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!.Status);
    }

    [Fact]
    public async Task ApprovingChoosesTheTier_AndIsAuditedWithThePreviousStatus()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterPendingClientAsync();
        var tier = await CreateTierAsync(admin);

        (await ApproveAsync(admin, id, tier)).EnsureSuccessStatusCode();

        var profile = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!;
        Assert.Equal(ClientAccountStatus.Approved, profile.Status);
        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = Assert.Single(entries, e => e.EntityId == id && e.Action == "Approve");
        var details = System.Text.Json.JsonDocument.Parse(entry.Details["data"]).RootElement;
        Assert.Equal(tier, details.GetProperty("PricingTierId").GetGuid());
        Assert.Equal("Pending", details.GetProperty("PreviousStatus").GetString());
    }

    [Fact]
    public async Task ASuspendedCustomer_IsApprovedAgainTheSameWay()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]))).StatusCode);

        var tier = await CreateTierAsync(admin);
        (await ApproveAsync(admin, id, tier)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Created, (await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]))).StatusCode);
    }

    [Fact]
    public async Task OnlyAnAdminCanApprove_NotTheCustomerNorAnEmployee()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await _factory.RegisterPendingClientAsync();
        var tier = await CreateTierAsync(admin);

        Assert.Equal(HttpStatusCode.Forbidden, (await ApproveAsync(customer, id, tier)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ApproveAsync(_factory.CreateClient(), id, tier)).StatusCode);
        Assert.Equal(ClientAccountStatus.Pending, (await customer.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!.Status);
    }
}
