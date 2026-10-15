using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>MRV-2.2: a customer reads and edits their own company details through the real HTTP pipeline.</summary>
public class ClientProfileTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public ClientProfileTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static Task<HttpResponseMessage> PutAsync(HttpClient client, string company, string billing, List<string>? shipping) =>
        client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest(company, billing, shipping));

    [Fact]
    public async Task ACustomer_SeesTheDetailsTheyRegisteredWith()
    {
        var (client, id) = await _factory.RegisterClientAsync();

        var profile = (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;

        Assert.Equal(id, profile.Id);
        Assert.Equal("Acme Co", profile.CompanyName);
        Assert.Equal("123 Main St", profile.BillingAddress);
        Assert.Empty(profile.ShippingAddresses);
        Assert.Equal(ClientAccountStatus.Approved, profile.Status);
    }

    [Fact]
    public async Task ACustomer_EditsTheirDetailsAndShippingAddresses_AndStaffSeeTheSame()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();

        var response = await PutAsync(client, "  Bar do Zé  ", "Rua A, 1", ["Rua B, 2", "rua b, 2", " ", "Rua C, 3"]);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = (await response.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!;
        Assert.Equal("Bar do Zé", saved.CompanyName);
        Assert.Equal(["Rua B, 2", "Rua C, 3"], saved.ShippingAddresses);
        var again = (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;
        Assert.Equal(["Rua B, 2", "Rua C, 3"], again.ShippingAddresses);
        var seenByStaff = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!;
        Assert.Equal("Bar do Zé", seenByStaff.CompanyName);
        Assert.Equal("Rua A, 1", seenByStaff.BillingAddress);
        Assert.Equal(["Rua B, 2", "Rua C, 3"], seenByStaff.ShippingAddresses);
    }

    [Fact]
    public async Task TheShippingList_IsReplacedAsAWhole_SoAddressesCanBeRemoved()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        await PutAsync(client, "Acme", "Rua A", ["Rua B", "Rua C"]);

        var response = await PutAsync(client, "Acme", "Rua A", ["Rua C"]);
        var cleared = await PutAsync(client, "Acme", "Rua A", []);

        Assert.Equal(["Rua C"], (await response.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!.ShippingAddresses);
        Assert.Empty((await cleared.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!.ShippingAddresses);
    }

    [Fact]
    public async Task LeavingTheShippingListOut_IsRefused_NotTreatedAsClearingIt()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        await PutAsync(client, "Acme", "Rua A", ["Rua B"]);

        var response = await client.PutAsJsonAsync("/api/client/profile", new { companyName = "Acme", billingAddress = "Rua A" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["Rua B"], (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!.ShippingAddresses);
    }

    [Fact]
    public async Task ControlCharacters_AreRefused_NotAServerError()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await PutAsync(client, "Acme", "Rua A", ["x\u0000y"])).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PutAsync(client, "A\u0000cme", "Rua A", [])).StatusCode);
    }

    [Fact]
    public async Task ACustomer_CanOnlyEverChangeTheirOwnAccount()
    {
        var (alice, aliceId) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();

        await PutAsync(bob, "Bob's Bar", "Rua Bob", ["Rua Bob 2"]);

        var untouched = (await alice.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;
        Assert.Equal(aliceId, untouched.Id);
        Assert.Equal("Acme Co", untouched.CompanyName);
        Assert.Empty(untouched.ShippingAddresses);
    }

    [Fact]
    public async Task ASuspendedCustomer_CanStillMaintainTheirDetails()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();

        var response = await PutAsync(client, "Acme Renamed", "Rua A", []);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(ClientAccountStatus.Suspended, (await response.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!.Status);
    }

    [Theory]
    [InlineData("", "Rua A")]
    [InlineData("Acme", "  ")]
    public async Task Refuses_MissingRequiredDetails_AndChangesNothing(string company, string billing)
    {
        var (client, _) = await _factory.RegisterClientAsync();

        var response = await PutAsync(client, company, billing, ["Rua X"]);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var profile = (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;
        Assert.Equal("Acme Co", profile.CompanyName);
        Assert.Empty(profile.ShippingAddresses);
    }

    [Fact]
    public async Task Refuses_TooManyShippingAddresses_AndTooLongOnes()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await PutAsync(client, "Acme", "Rua A", Enumerable.Range(1, 11).Select(i => $"Rua {i}").ToList())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PutAsync(client, "Acme", "Rua A", [new string('x', 501)])).StatusCode);
    }

    [Fact]
    public async Task IsForCustomersOnly()
    {
        var admin = await _factory.AdminAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/client/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PutAsync(admin, "A", "B", [])).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/client/profile")).StatusCode);
    }
}
