using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

public class IdentityValidationTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public IdentityValidationTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("a@b.com", true)]
    [InlineData("first.last+tag@sub.example.com.br", true)]
    [InlineData("not-an-email", false)]
    [InlineData("a@b", false)]
    [InlineData("Name <a@b.com>", false)]
    [InlineData("a@b.com trailing", false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData(null, false)]
    public void EmailAddressValidator_AcceptsOnlyRealLookingAddresses(string? email, bool expected) =>
        Assert.Equal(expected, EmailAddressValidator.IsValid(email));

    [Fact]
    public void EmailAddressValidator_RejectsAddressesLongerThanTheStandardAllows() =>
        Assert.False(EmailAddressValidator.IsValid(new string('a', 250) + "@b.com"));

    [Theory]
    [InlineData("not-an-email", "Acme", "01001-000")]
    [InlineData("ok@example.com", " ", "01001-000")]
    [InlineData("ok2@example.com", "Acme", "")]
    [InlineData("ok3@example.com", "Acme", "1234")]
    public async Task Register_RejectsBadEmailOrMissingCompanyDetails(string email, string company, string cep)
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", company, TestAddresses.Main with { PostalCode = cep }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_TrimsCompanyDetails_AndBoundsTheirLength()
    {
        var email = $"{Guid.NewGuid()}@example.com";

        var padded = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "  Acme Ltda  ", TestAddresses.Main with { Street = "  Rua A  ", PostalCode = " 01001-000 " }));
        var accountId = (await padded.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        var admin = await _factory.AdminAsync(); // admins may read client profiles through the employee endpoint
        var profile = await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{accountId}");

        var tooLongName = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest($"{Guid.NewGuid()}@example.com", "Test1234!", new string('c', 201), TestAddresses.Main));
        var tooLongAddress = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest($"{Guid.NewGuid()}@example.com", "Test1234!", "Acme", TestAddresses.Main with { Street = new string('a', 201) }));
        var noAddress = await _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new { email = $"{Guid.NewGuid()}@example.com", password = "Test1234!", companyName = "Acme" });

        Assert.Equal(HttpStatusCode.Created, padded.StatusCode);
        Assert.Equal("Acme Ltda", profile!.CompanyName);
        var billing = Assert.Single(profile.Addresses);
        Assert.Equal("Rua A", billing.Street);
        Assert.Equal("01001000", billing.PostalCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLongName.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLongAddress.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, noAddress.StatusCode);
    }

    [Fact]
    public async Task CreateEmployee_RejectsBadEmailAndBlankCode()
    {
        var admin = await _factory.AdminAsync();
        var badEmail = await admin.PostAsJsonAsync("/api/admin/employees", new CreateEmployeeRequest("nope", "Emp-1234!", "E-1", null, DateTime.UtcNow));
        var blankCode = await admin.PostAsJsonAsync("/api/admin/employees", new CreateEmployeeRequest($"{Guid.NewGuid()}@example.com", "Emp-1234!", " ", null, DateTime.UtcNow));
        var codeTooLong = await admin.PostAsJsonAsync("/api/admin/employees", new CreateEmployeeRequest($"{Guid.NewGuid()}@example.com", "Emp-1234!", new string('E', 51), null, DateTime.UtcNow));
        var good = await admin.PostAsJsonAsync("/api/admin/employees", new CreateEmployeeRequest($"{Guid.NewGuid()}@example.com", "Emp-1234!", "E-2", null, DateTime.UtcNow));

        Assert.Equal(HttpStatusCode.BadRequest, badEmail.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, blankCode.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, codeTooLong.StatusCode);
        Assert.Equal(HttpStatusCode.Created, good.StatusCode);
    }

    [Fact]
    public async Task ApprovingAClient_NeedsARealTier()
    {
        var admin = await _factory.AdminAsync();
        var (_, accountId) = await _factory.RegisterPendingClientAsync();
        var tier = (await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest($"T-{Guid.NewGuid():N}", false)))
            .Content.ReadFromJsonAsync<PricingTierDto>().Result!;

        var unknownTier = await admin.PutAsJsonAsync($"/api/admin/clients/{accountId}/approve", new ApproveClientRequest(Guid.NewGuid()));
        var good = await admin.PutAsJsonAsync($"/api/admin/clients/{accountId}/approve", new ApproveClientRequest(tier.Id));
        var unknownClient = await admin.PutAsJsonAsync($"/api/admin/clients/{Guid.NewGuid()}/approve", new ApproveClientRequest(tier.Id));

        Assert.Equal(HttpStatusCode.BadRequest, unknownTier.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, good.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknownClient.StatusCode);
    }
}
