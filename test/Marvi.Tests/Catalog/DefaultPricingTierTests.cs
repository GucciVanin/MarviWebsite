using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Catalog;

/// <summary>
/// The default pricing tier (MRV-4.9): exactly one tier is the default, it is created, healed and switched by one rule,
/// and new customers and anonymous visitors both get it. Each test starts from an empty system (its own host).
/// </summary>
public class DefaultPricingTierTests
{
    private static async Task<List<PricingTierDto>> TiersAsync(HttpClient admin) =>
        (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!;

    private static async Task<string> TierNameOfAsync(HttpClient admin, Guid clientAccountId)
    {
        var profile = await admin.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/employee/clients/{clientAccountId}");
        return profile.GetProperty("pricingTierName").GetString()!;
    }

    [Fact]
    public async Task OnAnEmptySystem_RegistrationCreatesTheStandardTierAsDefault_AndAssignsIt()
    {
        using var factory = new MarviApiFactory();
        var (_, accountId) = await factory.RegisterClientAsync();
        var admin = await factory.AdminAsync();

        var tier = Assert.Single(await TiersAsync(admin));

        Assert.Equal("Standard", tier.Name);
        Assert.True(tier.IsDefault);
        Assert.Equal("Standard", await TierNameOfAsync(admin, accountId));
    }

    [Fact]
    public async Task TheFirstTierEverCreated_IsTheDefault_WhateverTheRequestSays()
    {
        using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();

        var first = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest("Gold", false));
        var second = await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest("Silver", false));

        Assert.True((await first.Content.ReadFromJsonAsync<PricingTierDto>())!.IsDefault);
        Assert.False((await second.Content.ReadFromJsonAsync<PricingTierDto>())!.IsDefault);
    }

    [Fact]
    public async Task MakingAnotherTierTheDefault_LeavesExactlyOne_AndTheOnlyDefaultCannotBeUnset()
    {
        using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var gold = (await (await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest("Gold", false))).Content.ReadFromJsonAsync<PricingTierDto>())!;
        var silver = (await (await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest("Silver", false))).Content.ReadFromJsonAsync<PricingTierDto>())!;

        var switched = await admin.PutAsJsonAsync($"/api/admin/pricing-tiers/{silver.Id}", new UpsertPricingTierRequest("Silver", true));
        var tiers = await TiersAsync(admin);
        var unset = await admin.PutAsJsonAsync($"/api/admin/pricing-tiers/{silver.Id}", new UpsertPricingTierRequest("Silver", false));

        Assert.Equal(HttpStatusCode.OK, switched.StatusCode);
        Assert.Equal("Silver", Assert.Single(tiers, t => t.IsDefault).Name);
        Assert.Equal(HttpStatusCode.BadRequest, unset.StatusCode);
        Assert.Equal("A default tier is required. Make another tier the default instead.", await unset.Content.ReadAsStringAsync());
        Assert.Contains(tiers, t => t.Id == gold.Id && !t.IsDefault);
    }

    // Data created before the default flag existed: no tier is flagged, so the alphabetically first one stands in until
    // the first registration promotes it, which makes the choice deliberate.
    [Fact]
    public async Task WhenNoTierIsFlagged_TheAlphabeticallyFirstServesAndThenBecomesTheDefault()
    {
        using var factory = new MarviApiFactory();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.PricingTiers.Add(new PricingTier { Id = Guid.NewGuid(), Name = "Zeta", IsDefault = false });
            db.PricingTiers.Add(new PricingTier { Id = Guid.NewGuid(), Name = "Alpha", IsDefault = false });
            await db.SaveChangesAsync();
        }

        var (_, accountId) = await factory.RegisterClientAsync();
        var admin = await factory.AdminAsync();
        var tiers = await TiersAsync(admin);

        Assert.Equal("Alpha", await TierNameOfAsync(admin, accountId));
        Assert.Equal("Alpha", Assert.Single(tiers, t => t.IsDefault).Name);
    }
}
