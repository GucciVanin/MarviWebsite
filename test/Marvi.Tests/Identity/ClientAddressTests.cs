using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Identity;

/// <summary>MRV-9.3: a customer keeps several named, structured addresses; one is the billing address and one the default delivery address.</summary>
public class ClientAddressTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public ClientAddressTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<ClientOwnProfileDto> ProfileAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;

    private static async Task<ClientAddressDto> AddAsync(HttpClient client, ClientAddressRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/client/addresses", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ClientAddressDto>())!;
    }

    // ---- AC-2, AC-8: create and list

    [Fact]
    public async Task ACustomer_AddsSeveralAddresses_AndTheProfileListsThemBillingFirst()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial Campinas"));
        var armazem = await AddAsync(client, TestAddresses.Other("300", label: "Armazém"));

        var profile = await ProfileAsync(client);
        Assert.Equal(3, profile.Addresses.Count);
        Assert.Equal(["Endereço principal", "Armazém", "Filial Campinas"], profile.Addresses.Select(a => a.Label));
        Assert.Equal("13010000", filial.PostalCode);
        Assert.Equal("Campinas", filial.City);
        Assert.Equal("Sala 3", filial.Complement);
        Assert.Equal("Entregar de manhã", filial.DeliveryNotes);
        Assert.Equal("BR", filial.Country);
        Assert.False(filial.IsBilling);
        Assert.False(filial.IsDefaultDelivery);
        Assert.NotEqual(filial.Key, armazem.Key);
        Assert.Equal(profile.Addresses[0].Key, profile.BillingAddressKey);
        Assert.Equal(profile.Addresses[0].Key, profile.DefaultDeliveryKey);
    }

    [Fact]
    public async Task TheFirstAddressOfTheKind_BecomesTheBillingOrDefaultByItself()
    {
        var (client, id) = await _factory.RegisterClientAsync();
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            // A legacy account with no address at all.
            var db = scope.ServiceProvider.GetRequiredService<Marvi.Infrastructure.Data.AppDbContext>();
            db.ClientAddresses.RemoveRange(db.ClientAddresses.Where(a => a.ClientAccountId == id));
            await db.SaveChangesAsync();
        }

        var billingOnly = await AddAsync(client, TestAddresses.Other("1", ClientAddressKind.Billing));
        var delivery = await AddAsync(client, TestAddresses.Other("2", ClientAddressKind.Delivery));
        var another = await AddAsync(client, TestAddresses.Other("3", ClientAddressKind.Both));

        Assert.True(billingOnly.IsBilling);
        Assert.False(billingOnly.IsDefaultDelivery);
        Assert.False(delivery.IsBilling);
        Assert.True(delivery.IsDefaultDelivery);
        Assert.False(another.IsBilling);
        Assert.False(another.IsDefaultDelivery);
        var profile = await ProfileAsync(client);
        Assert.Equal(billingOnly.Key, profile.BillingAddressKey);
        Assert.Equal(delivery.Key, profile.DefaultDeliveryKey);
    }

    [Fact]
    public async Task MakingAnAddressTheBillingOrDefault_UnsetsThePreviousOneInTheSameChange()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var first = (await ProfileAsync(client)).Addresses.Single();

        var second = await AddAsync(client, TestAddresses.Other("200", ClientAddressKind.Both, billing: true, defaultDelivery: true));

        var profile = await ProfileAsync(client);
        Assert.Equal(second.Key, profile.BillingAddressKey);
        Assert.Equal(second.Key, profile.DefaultDeliveryKey);
        Assert.Equal(1, profile.Addresses.Count(a => a.IsBilling));
        Assert.Equal(1, profile.Addresses.Count(a => a.IsDefaultDelivery));
        Assert.False(profile.Addresses.Single(a => a.Key == first.Key).IsBilling);

        // ...and back, by editing the first one with the flags set.
        var put = await client.PutAsJsonAsync($"/api/client/addresses/{first.Key}", TestAddresses.Main with { Label = "Matriz", Kind = ClientAddressKind.Both, IsBilling = true });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        profile = await ProfileAsync(client);
        Assert.Equal(first.Key, profile.BillingAddressKey);
        Assert.Equal(second.Key, profile.DefaultDeliveryKey);
    }

    [Fact]
    public async Task AnAddress_CanBeEdited_AndAnEditClearsTheNeedsReviewFlag()
    {
        var (client, id) = await _factory.RegisterClientAsync();
        var key = (await ProfileAsync(client)).Addresses.Single().Key;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Marvi.Infrastructure.Data.AppDbContext>();
            db.ClientAddresses.Single(a => a.ClientAccountId == id).NeedsReview = true;
            await db.SaveChangesAsync();
        }

        Assert.True((await ProfileAsync(client)).Addresses.Single().NeedsReview);
        var put = await client.PutAsJsonAsync($"/api/client/addresses/{key}", TestAddresses.Main with { Label = "Sede", Kind = ClientAddressKind.Both, Number = "20", State = "rj" });

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var saved = (await put.Content.ReadFromJsonAsync<ClientAddressDto>())!;
        Assert.Equal(key, saved.Key);
        Assert.Equal("Sede", saved.Label);
        Assert.Equal("20", saved.Number);
        Assert.Equal("RJ", saved.State);
        Assert.False(saved.NeedsReview);
        Assert.True(saved.IsBilling);
        Assert.False((await ProfileAsync(client)).Addresses.Single().NeedsReview);
    }

    // ---- AC-3: validation

    public static TheoryData<string, ClientAddressRequest> Invalid() => new()
    {
        { "no street", TestAddresses.Other() with { Street = " " } },
        { "no label", TestAddresses.Other() with { Label = null } },
        { "no type", TestAddresses.Other() with { Kind = null } },
        { "short cep", TestAddresses.Other() with { PostalCode = "1301000" } },
        { "cep with letters", TestAddresses.Other() with { PostalCode = "1301000a" } },
        { "unknown uf", TestAddresses.Other() with { State = "XX" } },
        { "long street", TestAddresses.Other() with { Street = new string('s', 201) } },
        { "long notes", TestAddresses.Other() with { DeliveryNotes = new string('n', 301) } },
        { "line break in street", TestAddresses.Other() with { Street = "Rua\nA" } },
        { "nul in label", TestAddresses.Other() with { Label = "Fi\u0000lial" } },
        { "billing flag on a delivery-only address", TestAddresses.Other(kind: ClientAddressKind.Delivery, billing: true) },
        { "default-delivery flag on a billing-only address", TestAddresses.Other(kind: ClientAddressKind.Billing, defaultDelivery: true) },
    };

    [Theory]
    [MemberData(nameof(Invalid))]
    public async Task AnInvalidAddress_IsRefused_AndNothingIsSaved(string why, ClientAddressRequest request)
    {
        var (client, _) = await _factory.RegisterClientAsync();

        var response = await client.PostAsJsonAsync("/api/client/addresses", request);

        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, why);
        Assert.Single((await ProfileAsync(client)).Addresses);
    }

    [Fact]
    public async Task ARepeatedPlace_IsRefusedWithAClearMessage_IgnoringCaseAndAccents()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        await AddAsync(client, TestAddresses.Other("200") with { Complement = "Sálá 3" });

        var again = await client.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other("200", label: "Outro apelido") with { Complement = "SALA 3 ", PostalCode = "13010000" });
        var registeredOne = await client.PostAsJsonAsync("/api/client/addresses", TestAddresses.Main with { Label = "Mesma da matriz", Kind = ClientAddressKind.Delivery });

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Contains("already saved", await again.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, registeredOne.StatusCode);
        Assert.Equal(2, (await ProfileAsync(client)).Addresses.Count);
    }

    [Fact]
    public async Task EditingAnAddress_ToAnotherOnesPlace_IsRefused_ButKeepingItsOwnIsFine()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var other = await AddAsync(client, TestAddresses.Other("200"));

        var clash = await client.PutAsJsonAsync($"/api/client/addresses/{other.Key}", TestAddresses.Main with { Label = "x", Kind = ClientAddressKind.Delivery });
        var same = await client.PutAsJsonAsync($"/api/client/addresses/{other.Key}", TestAddresses.Other("200") with { Label = "Renomeada" });

        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        Assert.Equal(HttpStatusCode.OK, same.StatusCode);
    }

    [Fact]
    public async Task AtMostTwentyAddresses_AreAllowed()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        for (var i = 1; i < ClientAddressRules.MaxAddresses; i++)
        {
            await AddAsync(client, TestAddresses.Other(i.ToString(), label: $"Ponto {i}"));
        }

        var over = await client.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other("999", label: "21"));

        Assert.Equal(20, (await ProfileAsync(client)).Addresses.Count);
        Assert.Equal(HttpStatusCode.Conflict, over.StatusCode);
        Assert.Contains("At most 20", await over.Content.ReadAsStringAsync());
        Assert.Equal(20, (await ProfileAsync(client)).Addresses.Count);
    }

    // ---- AC-4: delete and the billing/default rules

    [Fact]
    public async Task TheBillingAddress_CannotBeRemoved_UntilAnotherIsChosen()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var matriz = (await ProfileAsync(client)).Addresses.Single();
        var filial = await AddAsync(client, TestAddresses.Other("200", ClientAddressKind.Both));

        var refused = await client.DeleteAsync($"/api/client/addresses/{matriz.Key}");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("billing", await refused.Content.ReadAsStringAsync());

        (await client.PutAsJsonAsync($"/api/client/addresses/{filial.Key}", TestAddresses.Other("200", ClientAddressKind.Both, billing: true, defaultDelivery: true))).EnsureSuccessStatusCode();
        var removed = await client.DeleteAsync($"/api/client/addresses/{matriz.Key}");

        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        var profile = await ProfileAsync(client);
        Assert.Equal(filial.Key, Assert.Single(profile.Addresses).Key);
        Assert.Equal(filial.Key, profile.BillingAddressKey);
    }

    [Fact]
    public async Task TheDefaultDeliveryAddress_CannotBeRemoved_AndNeitherCanTheLastDeliveryCapableOne()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var matriz = (await ProfileAsync(client)).Addresses.Single();
        var billingOnly = await AddAsync(client, TestAddresses.Other("1", ClientAddressKind.Billing, billing: true));
        var delivery = await AddAsync(client, TestAddresses.Other("2", ClientAddressKind.Delivery));

        // matriz is Both (default delivery); billingOnly is the billing address now; delivery is a second delivery-capable one.
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/client/addresses/{matriz.Key}")).StatusCode);
        (await client.PutAsJsonAsync($"/api/client/addresses/{delivery.Key}", TestAddresses.Other("2", ClientAddressKind.Delivery, defaultDelivery: true))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/client/addresses/{matriz.Key}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/client/addresses/{delivery.Key}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/client/addresses/{billingOnly.Key}")).StatusCode);
        Assert.Equal(2, (await ProfileAsync(client)).Addresses.Count);
    }

    [Fact]
    public async Task TheTypeOfTheBillingOrDefaultAddress_CannotBeChangedToOneThatCannotServe()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var matriz = (await ProfileAsync(client)).Addresses.Single();

        var toDelivery = await client.PutAsJsonAsync($"/api/client/addresses/{matriz.Key}", TestAddresses.Main with { Label = "x", Kind = ClientAddressKind.Delivery });
        var toBilling = await client.PutAsJsonAsync($"/api/client/addresses/{matriz.Key}", TestAddresses.Main with { Label = "x", Kind = ClientAddressKind.Billing });

        Assert.Equal(HttpStatusCode.Conflict, toDelivery.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, toBilling.StatusCode);
        Assert.Equal(ClientAddressKind.Both, (await ProfileAsync(client)).Addresses.Single().Kind);
    }

    // ---- AC-8: access

    [Fact]
    public async Task ACustomer_CanNeverReadOrChangeAnotherCustomersAddress_Answer404()
    {
        var (alice, _) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();
        var bobsKey = (await ProfileAsync(bob)).Addresses.Single().Key;
        var alicesOwn = await AddAsync(alice, TestAddresses.Other("200"));

        var put = await alice.PutAsJsonAsync($"/api/client/addresses/{bobsKey}", TestAddresses.Other("999"));
        var delete = await alice.DeleteAsync($"/api/client/addresses/{bobsKey}");
        var random = await alice.DeleteAsync($"/api/client/addresses/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, random.StatusCode);
        Assert.DoesNotContain(bobsKey, (await ProfileAsync(alice)).Addresses.Select(a => a.Key));
        var bobAfter = (await ProfileAsync(bob)).Addresses.Single();
        Assert.Equal(bobsKey, bobAfter.Key);
        Assert.Equal("Praça da Sé", bobAfter.Street);
        Assert.DoesNotContain(alicesOwn.Key, (await ProfileAsync(bob)).Addresses.Select(a => a.Key));
    }

    [Fact]
    public async Task TheAddressEndpoints_AreForCustomersOnly()
    {
        var admin = await _factory.AdminAsync();
        var anonymous = _factory.CreateClient();
        var key = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync($"/api/client/addresses/{key}", TestAddresses.Other())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.DeleteAsync($"/api/client/addresses/{key}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PutAsJsonAsync($"/api/client/addresses/{key}", TestAddresses.Other())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.DeleteAsync($"/api/client/addresses/{key}")).StatusCode);
    }

    [Fact]
    public async Task ASuspendedCustomer_CanStillMaintainTheirAddresses()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    // ---- AC-7: staff and the audit log

    [Fact]
    public async Task Staff_SeeEveryAddressWithItsKeys_AndAnAdminCanFixOne_Audited()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var filial = await AddAsync(client, TestAddresses.Other("200"));
        var (bob, bobId) = await _factory.RegisterClientAsync();
        var bobsKey = (await ProfileAsync(bob)).Addresses.Single().Key;

        var seen = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!;
        var fix = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/addresses/{filial.Key}", TestAddresses.Other("200") with { PostalCode = "13010-111", Street = "Rua Corrigida" });
        var otherCustomersKey = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/addresses/{bobsKey}", TestAddresses.Other("200"));
        var unknownCustomer = await admin.PutAsJsonAsync($"/api/admin/clients/{Guid.NewGuid()}/addresses/{filial.Key}", TestAddresses.Other("200"));

        Assert.Equal(2, seen.Addresses.Count);
        Assert.Equal(seen.Addresses[0].Key, seen.BillingAddressKey);
        Assert.Equal(HttpStatusCode.OK, fix.StatusCode);
        Assert.Equal("Rua Corrigida", (await ProfileAsync(client)).Addresses.Single(a => a.Key == filial.Key).Street);
        Assert.Equal(HttpStatusCode.NotFound, otherCustomersKey.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknownCustomer.StatusCode);
        Assert.Equal("Praça da Sé", (await ProfileAsync(bob)).Addresses.Single().Street);
        Assert.NotEqual(Guid.Empty, bobId);

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var update = Assert.Single(entries, e => e.EntityName == nameof(ClientAddress) && e.Action == "Update" && e.Details["data"].Contains("\"By\":\"Admin\""));
        Assert.NotNull(update.EntityNumber);
    }

    [Fact]
    public async Task EveryAddressChange_ByTheCustomer_IsWrittenToTheAuditLog()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var before = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!.Count(e => e.EntityName == nameof(ClientAddress));

        var added = await AddAsync(client, TestAddresses.Other("200"));
        (await client.PutAsJsonAsync($"/api/client/addresses/{added.Key}", TestAddresses.Other("200") with { Label = "Renomeada" })).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/client/addresses/{added.Key}")).EnsureSuccessStatusCode();

        var mine = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!
            .Where(e => e.EntityName == nameof(ClientAddress)).ToList();
        Assert.Equal(before + 3, mine.Count);
        var latest = mine.Take(3).Select(e => e.Action).ToList();
        Assert.Equal(["Delete", "Update", "Create"], latest);
        Assert.All(mine.Take(3), e => Assert.Contains("\"By\":\"Customer\"", e.Details["data"]));
        Assert.All(mine.Take(3), e => Assert.NotEqual(Guid.Empty, e.ActorUserId));
    }

    [Fact]
    public async Task TheAuditEntry_OfARemovedAddress_StillNamesTheCustomer()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var number = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!.CustomerNumber;
        var added = await AddAsync(client, TestAddresses.Other("200"));

        (await client.DeleteAsync($"/api/client/addresses/{added.Key}")).EnsureSuccessStatusCode();

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var removed = entries.First(e => e.EntityName == nameof(ClientAddress) && e.Action == "Delete");
        Assert.Equal(number, removed.EntityNumber);
        var created = entries.First(e => e.EntityName == nameof(ClientAddress) && e.Action == "Create");
        Assert.Equal(number, created.EntityNumber);
    }

    [Fact]
    public async Task ARefusedChange_WritesNoAuditEntry()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var count = async () => (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!.Count(e => e.EntityName == nameof(ClientAddress));
        var before = await count();

        await client.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other() with { PostalCode = "x" });
        await client.DeleteAsync($"/api/client/addresses/{(await ProfileAsync(client)).Addresses.Single().Key}");

        Assert.Equal(before, await count());
    }
}
