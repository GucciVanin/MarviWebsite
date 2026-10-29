using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>MRV-3.5: not-found, unknown-tier and conflict answers of the admin client endpoints, plus the employee client lookup.</summary>
public class AdminClientsContractTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public AdminClientsContractTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task UnknownCustomers_Are404_OnApproveSuspendTierAndLookup()
    {
        var admin = await _factory.AdminAsync();
        await _factory.RegisterClientAsync(); // creates the default tier
        var tier = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!.Single(t => t.IsDefault);
        var unknown = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/clients/{unknown}/approve", new ApproveClientRequest(tier.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsync($"/api/admin/clients/{unknown}/suspend", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/clients/{unknown}/pricing-tier", new UpdateClientTierRequest(tier.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/employee/clients/{unknown}")).StatusCode);
    }

    [Fact]
    public async Task ApproveAgain_Is409_AndSuspendTwiceIs409()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterClientAsync(); // already approved
        var tier = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!.Single(t => t.IsDefault);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/approve", new ApproveClientRequest(tier.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).StatusCode);
    }

    [Fact]
    public async Task UnknownPricingTier_Is400_OnApproveAndOnTierChange()
    {
        var admin = await _factory.AdminAsync();
        var (_, pending) = await _factory.RegisterPendingClientAsync();
        var (_, approved) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/clients/{pending}/approve", new ApproveClientRequest(Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/clients/{approved}/pricing-tier", new UpdateClientTierRequest(Guid.NewGuid()))).StatusCode);
    }

    [Fact]
    public async Task EmployeeClientLookup_ReturnsTheProfileOfAnExistingCustomer()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterClientAsync();

        var response = await admin.GetAsync($"/api/employee/clients/{id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = (await response.Content.ReadFromJsonAsync<ClientProfileDto>())!;
        Assert.Equal(id, profile.Id);
        Assert.Equal("Acme Co", profile.CompanyName);
    }
}
