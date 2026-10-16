using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>MRV-2.4b.1: staff find a customer by company name instead of by id.</summary>
public class ClientDirectoryTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public ClientDirectoryTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static string Unique() => Guid.NewGuid().ToString("N")[..8];

    private async Task<Guid> RegisterAsync(string company)
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register",
            new RegisterRequest($"{Guid.NewGuid()}@example.com", "Test1234!", company, "Rua A, 1"));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task<PagedResult<ClientSummaryDto>> SearchAsync(HttpClient staff, string query)
    {
        var response = await staff.GetAsync($"/api/employee/clients{query}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PagedResult<ClientSummaryDto>>())!;
    }

    [Fact]
    public async Task Search_FindsCustomersByPartOfTheCompanyName_IgnoringCase_InAlphabeticalOrder()
    {
        var admin = await _factory.AdminAsync();
        var tag = Unique();
        var bravo = await RegisterAsync($"{tag} Bravo Bar");
        var alpha = await RegisterAsync($"{tag} alpha Adega");
        await RegisterAsync($"Other {Unique()} Mercado");

        var found = await SearchAsync(admin, $"?search={tag.ToUpperInvariant()}");

        Assert.Equal([alpha, bravo], found.Items.Select(c => c.Id));
        Assert.Equal(2, found.TotalCount);
        Assert.Equal($"{tag} alpha Adega", found.Items[0].CompanyName);
    }

    [Fact]
    public async Task EachLine_ShowsStatusTierAndCredit_SoStaffCanTellCustomersApart()
    {
        var admin = await _factory.AdminAsync();
        var tag = Unique();
        var id = await RegisterAsync($"{tag} Loja");
        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();

        var line = Assert.Single((await SearchAsync(admin, $"?search={tag}")).Items);

        Assert.Equal(ClientAccountStatus.Suspended, line.Status);
        Assert.Equal("Standard", line.PricingTierName);
        // The tier's id too: names are not unique, so a screen that changes a tier needs the id.
        var tiers = (await admin.GetFromJsonAsync<List<Marvi.Api.Features.Catalog.Contracts.PricingTierDto>>("/api/admin/pricing-tiers"))!;
        Assert.Equal(tiers.Single(t => t.IsDefault).Id, line.PricingTierId);
    }

    [Fact]
    public async Task WithoutASearch_ListsEveryone_Paged()
    {
        var admin = await _factory.AdminAsync();
        for (var i = 0; i < 3; i++)
        {
            await RegisterAsync($"Paged {Unique()}");
        }

        var first = await SearchAsync(admin, "?page=1&pageSize=2");
        var second = await SearchAsync(admin, "?page=2&pageSize=2");

        Assert.Equal(2, first.Items.Count);
        Assert.True(first.TotalCount >= 3);
        Assert.NotEmpty(second.Items);
        Assert.Empty(first.Items.Select(c => c.Id).Intersect(second.Items.Select(c => c.Id)));
    }

    [Fact]
    public async Task APercentSignOrUnderscore_IsTextToFind_NotAWildcard()
    {
        var admin = await _factory.AdminAsync();
        var tag = Unique();
        await RegisterAsync($"{tag} 100% Frio");
        await RegisterAsync($"{tag} 1000 Frio");

        var found = await SearchAsync(admin, $"?search={Uri.EscapeDataString(tag + " 100%")}");

        Assert.Equal($"{tag} 100% Frio", Assert.Single(found.Items).CompanyName);
    }

    [Fact]
    public async Task Search_RefusesAnInvalidPage_AndIsForStaffOnly()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/employee/clients?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/employee/clients")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/employee/clients")).StatusCode);
    }
}
