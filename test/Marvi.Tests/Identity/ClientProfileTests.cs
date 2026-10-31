using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>MRV-2.2 / MRV-9.3: a customer reads and edits their own company details through the real HTTP pipeline (addresses: ClientAddressTests).</summary>
public class ClientProfileTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public ClientProfileTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static Task<HttpResponseMessage> PutAsync(HttpClient client, string company) =>
        client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest(company));

    [Fact]
    public async Task ACustomer_SeesTheDetailsTheyRegisteredWith_TheAddressBeingTheBillingAndDefaultDeliveryOne()
    {
        var (client, id) = await _factory.RegisterClientAsync();

        var profile = (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;

        Assert.Equal(id, profile.Id);
        Assert.Equal("Acme Co", profile.CompanyName);
        var address = Assert.Single(profile.Addresses);
        Assert.Equal("Praça da Sé", address.Street);
        Assert.Equal("01001000", address.PostalCode);
        Assert.Equal(ClientAddressKind.Both, address.Kind);
        Assert.True(address.IsBilling);
        Assert.True(address.IsDefaultDelivery);
        Assert.False(address.NeedsReview);
        Assert.Equal(address.Key, profile.BillingAddressKey);
        Assert.Equal(address.Key, profile.DefaultDeliveryKey);
        Assert.Equal(ClientAccountStatus.Approved, profile.Status);
        Assert.InRange(profile.CreatedAt, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task TheProfileJson_NeverCarriesTheDatabaseIdOfAnAddress()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var json = await client.GetStringAsync("/api/client/profile");

        using var document = System.Text.Json.JsonDocument.Parse(json);
        var address = document.RootElement.GetProperty("addresses")[0];
        Assert.False(address.TryGetProperty("id", out _));
        Assert.False(address.TryGetProperty("clientAccountId", out _));
        Assert.True(address.TryGetProperty("key", out _));
    }

    [Fact]
    public async Task ACustomer_EditsTheirCompanyName_AndStaffSeeTheSame()
    {
        var admin = await _factory.AdminAsync();
        // Only a Pending customer can still rename themselves: approval verifies the record (MRV-9.4, ClientRegistrationTests).
        var (client, id) = await _factory.RegisterPendingClientAsync();

        var response = await PutAsync(client, "  Bar do Zé  ");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Bar do Zé", (await response.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!.CompanyName);
        var seenByStaff = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!;
        Assert.Equal("Bar do Zé", seenByStaff.CompanyName);
        Assert.Equal("Praça da Sé", Assert.Single(seenByStaff.Addresses).Street);
        Assert.Equal(seenByStaff.Addresses[0].Key, seenByStaff.BillingAddressKey);
    }

    [Fact]
    public async Task ThisEndpoint_NoLongerTouchesAddresses_EvenIfTheOldFieldsAreSent()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        var response = await client.PutAsJsonAsync("/api/client/profile", new { companyName = "Acme Co", billingAddress = "Rua A", shippingAddresses = new[] { "Rua B" } });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = (await response.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!;
        Assert.Equal("Praça da Sé", Assert.Single(profile.Addresses).Street);
    }

    [Fact]
    public async Task ControlCharacters_AreRefused_NotAServerError()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await PutAsync(client, "A\u0000cme")).StatusCode);
    }

    [Fact]
    public async Task ACustomer_CanOnlyEverChangeTheirOwnAccount()
    {
        var (alice, aliceId) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();

        await PutAsync(bob, "Bob's Bar");

        var untouched = (await alice.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;
        Assert.Equal(aliceId, untouched.Id);
        Assert.Equal("Acme Co", untouched.CompanyName);
    }

    [Fact]
    public async Task ASuspendedCustomer_CannotEditAnyRegistrationField()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();

        var response = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme Co", null, new RegistrationRequest(Phone: "11 91234-5678")));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PutAsync(client, "Acme Renamed")).StatusCode);
        // Reading is still allowed, and an unchanged save is not an edit.
        var profile = (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;
        Assert.Equal(ClientAccountStatus.Suspended, profile.Status);
        Assert.Null(profile.Registration!.Phone);
        Assert.Equal(HttpStatusCode.OK, (await PutAsync(client, "Acme Co")).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public async Task Refuses_ABlankCompanyName_AndChangesNothing(string company)
    {
        var (client, _) = await _factory.RegisterClientAsync();

        var response = await PutAsync(client, company);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Acme Co", (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!.CompanyName);
    }

    [Fact]
    public async Task IsForCustomersOnly()
    {
        var admin = await _factory.AdminAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/client/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PutAsync(admin, "A")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/client/profile")).StatusCode);
    }
}
