using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Identity;

/// <summary>
/// MRV-9.4: business and personal accounts, their registration data (CNPJ, CPF, birth date and the rest), the lock after approval, the admin's full
/// control (audited, CPF masked) and the CPF handling (encrypted at rest, masked for staff). Today is pinned to 2026-10-30 by the test factory.
/// </summary>
public class ClientRegistrationTests : IClassFixture<MarviApiFactory>
{
    private static readonly DateOnly Adult = new(1990, 3, 2);

    private readonly MarviApiFactory _factory;

    public ClientRegistrationTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static string NewEmail() => $"{Guid.NewGuid()}@example.com";

    // Distinct valid CNPJs (the head office of a fixed root with the right check digits), one per call.
    private static int _cnpjSeed = 10_000_000;
    private static string NewCnpj()
    {
        var root = Interlocked.Increment(ref _cnpjSeed).ToString("D8") + "0001";
        return root + CnpjRules.CheckDigits(root);
    }

    private static string NewCpf()
    {
        // 9 digits from a counter; the two check digits are computed with the same rule the API uses (CpfRules is tested on its own).
        var n = Interlocked.Increment(ref _cnpjSeed);
        var nine = (n % 1_000_000_000).ToString("D9");
        if (nine.Distinct().Count() == 1) nine = "123456789";
        string Dig(string s, int from)
        {
            var sum = 0;
            for (var i = 0; i < s.Length; i++) sum += (s[i] - '0') * (from - i);
            var r = sum % 11;
            return (r < 2 ? 0 : 11 - r).ToString();
        }

        var d1 = Dig(nine, 10);
        var d2 = Dig(nine + d1, 11);
        return nine + d1 + d2;
    }

    private Task<HttpResponseMessage> RegisterAsync(string name, AccountType? type, RegistrationRequest? registration, string? email = null) =>
        _factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email ?? NewEmail(), "Test1234!", name, TestAddresses.Main, type, registration));

    private async Task<(HttpClient Client, Guid Id)> RegisterOkAsync(string name, AccountType type, RegistrationRequest? registration, bool approve = false)
    {
        var email = NewEmail();
        var response = await RegisterAsync(name, type, registration, email);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var id = (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        if (approve)
        {
            var admin = await _factory.AdminAsync();
            var tiers = (await admin.GetFromJsonAsync<List<Marvi.Api.Features.Catalog.Contracts.PricingTierDto>>("/api/admin/pricing-tiers"))!;
            (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/approve", new ApproveClientRequest(tiers.Single(t => t.IsDefault).Id))).EnsureSuccessStatusCode();
        }

        return (await _factory.LoginAsync(email, "Test1234!"), id);
    }

    private static RegistrationRequest Company(string? cnpj = null) => new(
        Phone: "(11) 91234-5678", InvoiceEmail: "nfe@acme.com.br", Cnpj: cnpj ?? NewCnpj(), LegalName: "Acme Comércio Ltda", TradeName: "Acme",
        StateRegistrationStatus: StateRegistrationStatus.Contributor, StateRegistration: "110.042.490.114", MunicipalRegistration: "123456", MainCnae: "4634-6/01",
        TaxRegime: TaxRegime.SimplesNacional, OpeningDate: new DateOnly(2010, 5, 4), ContactName: "Ana Souza");

    private static RegistrationRequest Person(string? cpf = null, DateOnly? birth = null) => new(Phone: "11 3333-4444", InvoiceEmail: "joao@example.com", Cpf: cpf ?? NewCpf(), BirthDate: birth ?? Adult);

    private static async Task<ClientOwnProfileDto> OwnAsync(HttpClient client) => (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;

    private static async Task<List<string>> ProblemsAsync(HttpResponseMessage response) => (await FieldProblemsAsync(response)).Select(p => p.Message).ToList();

    /// <summary>The 400 body: a list of {field, message} (AC-3: the answer names the field).</summary>
    private static async Task<List<RegistrationProblem>> FieldProblemsAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<List<RegistrationProblem>>())!;
    }

    private static Task<HttpResponseMessage> RevealAsync(HttpClient client, Guid id, string? reason = "Conferir o cadastro") =>
        client.PostAsJsonAsync($"/api/admin/clients/{id}/cpf/reveal", new RevealCpfRequest(reason));

    // ---- AC-1, AC-3: registration of each type

    [Fact]
    public async Task ABusinessAccount_RegistersWithItsData_NormalisedAndComplete()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, Company("11.222.333/0001-81"));

        var profile = await OwnAsync(client);
        var r = profile.Registration!;
        Assert.Equal(AccountType.Business, r.AccountType);
        Assert.Equal("11222333000181", r.Cnpj);
        Assert.Equal("11912345678", r.Phone);
        Assert.Equal("110042490114", r.StateRegistration);
        Assert.Equal("4634601", r.MainCnae);
        Assert.Equal(StateRegistrationStatus.Contributor, r.StateRegistrationStatus);
        Assert.False(r.HasCpf);
        Assert.Empty(r.Missing);
        Assert.False(profile.RegistrationLocked);
    }

    [Fact]
    public async Task AnAlphanumericCnpj_IsAccepted()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, new RegistrationRequest(Cnpj: "12.abc.345/01de-35"));
        Assert.Equal("12ABC34501DE35", (await OwnAsync(client)).Registration!.Cnpj);
    }

    [Fact]
    public async Task ARegistrationWithoutAType_IsABusinessAccount_WithNothingElseRequired()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, null);
        var registration = (await OwnAsync(client)).Registration!;
        Assert.Equal(AccountType.Business, registration.AccountType);
        Assert.Contains("cnpj", registration.Missing);
    }

    [Fact]
    public async Task APersonalAccount_RegistersWithCpfAndBirthDate_AndSeesItsCpfMaskedOnly()
    {
        var cpf = NewCpf();
        var (client, _) = await RegisterOkAsync("João da Silva", AccountType.Personal, Person(cpf));

        var json = await client.GetStringAsync("/api/client/profile");
        var r = (await OwnAsync(client)).Registration!;
        Assert.Equal(AccountType.Personal, r.AccountType);
        Assert.True(r.HasCpf);
        Assert.Equal(CpfRules.Mask(cpf), r.CpfMasked);
        Assert.Matches(@"^\*\*\*\.\d{3}\.\d{3}-\*\*$", r.CpfMasked!);
        Assert.Equal(Adult, r.BirthDate);
        Assert.Null(r.Cnpj);
        Assert.DoesNotContain(cpf, json);
        Assert.DoesNotContain(CpfRules.Format(cpf), json);
        Assert.Empty(r.Missing);
    }

    [Fact]
    public async Task TheCpf_IsStoredEncrypted_WithAKeyedHash_NeverInTheClear()
    {
        var cpf = NewCpf();
        var (_, id) = await RegisterOkAsync("João", AccountType.Personal, Person(cpf));

        using var scope = _factory.Services.CreateScope();
        var account = await scope.ServiceProvider.GetRequiredService<AppDbContext>().ClientAccounts.FindAsync(id);
        Assert.NotNull(account!.CpfProtected);
        Assert.DoesNotContain(cpf, account.CpfProtected);
        Assert.DoesNotContain(cpf.Substring(0, 9), account.CpfProtected);
        Assert.Matches("^[0-9a-f]{64}$", account.CpfHash!);
        Assert.NotEqual(cpf, account.CpfHash);
    }

    // ---- AC-3: validation, 400 naming the field

    [Theory]
    [InlineData("cnpj", "CNPJ")]
    [InlineData("phone", "Telefone")]
    [InlineData("email", "E-mail para nota")]
    [InlineData("cnae", "CNAE")]
    [InlineData("ie", "Inscrição estadual")]
    [InlineData("opening", "Data de abertura")]
    public async Task ABusinessField_ThatIsWrong_Answers400NamingTheField(string which, string named)
    {
        var request = which switch
        {
            "cnpj" => new RegistrationRequest(Cnpj: "11222333000182"),
            "phone" => new RegistrationRequest(Phone: "123"),
            "email" => new RegistrationRequest(InvoiceEmail: "nope"),
            "cnae" => new RegistrationRequest(MainCnae: "12"),
            "ie" => new RegistrationRequest(StateRegistrationStatus: StateRegistrationStatus.Contributor),
            _ => new RegistrationRequest(OpeningDate: new DateOnly(2026, 10, 31)),
        };

        var problems = await ProblemsAsync(await RegisterAsync("Acme", AccountType.Business, request));

        Assert.Contains(problems, p => p.Contains(named));
    }

    [Fact]
    public async Task APersonalAccount_WithoutCpfOrBirthDate_Answers400()
    {
        var problems = await ProblemsAsync(await RegisterAsync("João", AccountType.Personal, new RegistrationRequest()));
        Assert.Contains(problems, p => p.Contains("CPF"));
        Assert.Contains(problems, p => p.Contains("nascimento"));
    }

    [Fact]
    public async Task AnInvalidCpf_Answers400()
    {
        var problems = await ProblemsAsync(await RegisterAsync("João", AccountType.Personal, Person("111.444.777-36")));
        Assert.Single(problems, p => p.Contains("CPF inválido"));
    }

    [Fact]
    public async Task UnderEighteen_Answers400WithTheAgeRuleExplained_AndExactlyEighteenIsAccepted()
    {
        var problems = await ProblemsAsync(await RegisterAsync("Jovem", AccountType.Personal, Person(NewCpf(), new DateOnly(2008, 10, 31))));
        Assert.Contains("18 anos", Assert.Single(problems));
        Assert.Contains("bebidas alcoólicas", problems[0]);

        Assert.Equal(HttpStatusCode.Created, (await RegisterAsync("Maior", AccountType.Personal, Person(NewCpf(), new DateOnly(2008, 10, 30)))).StatusCode);
    }

    [Fact]
    public async Task TheOtherTypesFields_AreRefused()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await RegisterAsync("Acme", AccountType.Business, new RegistrationRequest(Cpf: NewCpf()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await RegisterAsync("João", AccountType.Personal, Person() with { Cnpj = NewCnpj() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await RegisterAsync("João", AccountType.Personal, Person() with { TaxRegime = TaxRegime.Mei })).StatusCode);
    }

    [Fact]
    public async Task ARefusedRegistration_LeavesNoLoginBehind()
    {
        var email = NewEmail();
        Assert.Equal(HttpStatusCode.BadRequest, (await RegisterAsync("Acme", AccountType.Business, new RegistrationRequest(Cnpj: "1"), email)).StatusCode);

        // The same e-mail can still register: nothing was created by the refused attempt.
        Assert.Equal(HttpStatusCode.Created, (await RegisterAsync("Acme", AccountType.Business, null, email)).StatusCode);
    }

    // ---- AC-3: uniqueness without revealing whose

    [Fact]
    public async Task ADuplicateCnpj_Answers409_WithoutSayingWhose()
    {
        var cnpj = NewCnpj();
        await RegisterOkAsync("First Co Secret Name", AccountType.Business, new RegistrationRequest(Cnpj: cnpj));

        var response = await RegisterAsync("Second", AccountType.Business, new RegistrationRequest(Cnpj: CnpjRules.Format(cnpj)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(ClientRegistrationService.DuplicateMessage, body);
        Assert.DoesNotContain("CNPJ", body);
        Assert.DoesNotContain("Secret", body);
    }

    [Fact]
    public async Task ADuplicateCpf_Answers409_AtRegistrationAndOnTheProfile()
    {
        var cpf = NewCpf();
        await RegisterOkAsync("João", AccountType.Personal, Person(cpf));

        var again = await RegisterAsync("Maria", AccountType.Personal, Person(cpf));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Contains(ClientRegistrationService.DuplicateMessage, await again.Content.ReadAsStringAsync());

        var (maria, _) = await RegisterOkAsync("Maria", AccountType.Personal, Person(NewCpf()));
        var edit = await maria.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Maria", AccountType.Personal, Person(cpf)));
        Assert.Equal(HttpStatusCode.Conflict, edit.StatusCode);
    }

    [Fact]
    public async Task ADuplicateCnpj_OnTheProfile_Answers409_ButKeepingYourOwnIsFine()
    {
        var cnpj = NewCnpj();
        await RegisterOkAsync("First", AccountType.Business, new RegistrationRequest(Cnpj: cnpj));
        var (second, _) = await RegisterOkAsync("Second", AccountType.Business, new RegistrationRequest(Cnpj: NewCnpj()));

        Assert.Equal(HttpStatusCode.Conflict, (await second.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Second", null, new RegistrationRequest(Cnpj: cnpj)))).StatusCode);
        var own = (await OwnAsync(second)).Registration!.Cnpj;
        Assert.Equal(HttpStatusCode.OK, (await second.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Second", null, new RegistrationRequest(Cnpj: own, Phone: "11 91234-5678")))).StatusCode);
    }

    // ---- AC-4: Pending may change everything, Approved is locked

    [Fact]
    public async Task APendingCustomer_CanChangeTheirWholeRecord_IncludingTheType()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, Company());

        var toPerson = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("João Silva", AccountType.Personal, Person(NewCpf())));

        Assert.Equal(HttpStatusCode.OK, toPerson.StatusCode);
        var profile = (await toPerson.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!;
        Assert.Equal("João Silva", profile.CompanyName);
        Assert.Equal(AccountType.Personal, profile.Registration!.AccountType);
        Assert.Null(profile.Registration.Cnpj);
        Assert.Null(profile.Registration.LegalName);
        Assert.True(profile.Registration.HasCpf);
    }

    [Fact]
    public async Task APendingCustomer_SwitchingType_WithoutTheNewTypesData_Answers400()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, Company());
        var response = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("João", AccountType.Personal));
        var problems = await ProblemsAsync(response);
        Assert.Contains(problems, p => p.Contains("CPF"));
    }

    [Fact]
    public async Task AnApprovedCustomer_CannotChangeTheVerifiedRecord_403_AndNothingIsSaved()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, Company(), approve: true);
        var current = (await OwnAsync(client)).Registration!;
        Assert.True((await OwnAsync(client)).RegistrationLocked);

        RegistrationRequest Same() => new(current.Phone, current.InvoiceEmail, current.Cnpj, current.LegalName, current.TradeName, current.StateRegistrationStatus,
            current.StateRegistration, current.MunicipalRegistration, current.MainCnae, current.TaxRegime, current.OpeningDate, current.ContactName);

        var changes = new (string Name, UpdateClientProfileRequest Request)[]
        {
            ("name", new UpdateClientProfileRequest("Other Name", null, Same())),
            ("type", new UpdateClientProfileRequest("Acme", AccountType.Personal, Person(NewCpf()))),
            ("cnpj", new UpdateClientProfileRequest("Acme", null, Same() with { Cnpj = NewCnpj() })),
            ("legal", new UpdateClientProfileRequest("Acme", null, Same() with { LegalName = "Other Ltda" })),
            ("trade", new UpdateClientProfileRequest("Acme", null, Same() with { TradeName = "Other" })),
            ("ieStatus", new UpdateClientProfileRequest("Acme", null, Same() with { StateRegistrationStatus = StateRegistrationStatus.Exempt, StateRegistration = null })),
            ("ie", new UpdateClientProfileRequest("Acme", null, Same() with { StateRegistration = "999999999" })),
            ("municipal", new UpdateClientProfileRequest("Acme", null, Same() with { MunicipalRegistration = "1" })),
            ("cnae", new UpdateClientProfileRequest("Acme", null, Same() with { MainCnae = "4711302" })),
            ("regime", new UpdateClientProfileRequest("Acme", null, Same() with { TaxRegime = TaxRegime.LucroReal })),
            ("opening", new UpdateClientProfileRequest("Acme", null, Same() with { OpeningDate = new DateOnly(2011, 1, 1) })),
        };

        foreach (var (name, request) in changes)
        {
            var response = await client.PutAsJsonAsync("/api/client/profile", request);
            Assert.True(response.StatusCode == HttpStatusCode.Forbidden, $"{name}: expected 403, got {(int)response.StatusCode}");
            Assert.Contains("entre em contato", (await response.Content.ReadAsStringAsync()), StringComparison.OrdinalIgnoreCase);
        }

        var after = (await OwnAsync(client)).Registration!;
        Assert.Equal(current.Cnpj, after.Cnpj);
        Assert.Equal(current.LegalName, after.LegalName);
        Assert.Equal("Acme", (await OwnAsync(client)).CompanyName);
    }

    [Fact]
    public async Task AnApprovedCustomer_CanStillChangePhone_InvoiceEmailAndContactPerson()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, Company(), approve: true);
        var c = (await OwnAsync(client)).Registration!;

        var response = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme", null,
            new RegistrationRequest(Phone: "21 2222-3333", InvoiceEmail: "novo@acme.com.br", Cnpj: c.Cnpj, LegalName: c.LegalName, TradeName: c.TradeName,
                StateRegistrationStatus: c.StateRegistrationStatus, StateRegistration: c.StateRegistration, MunicipalRegistration: c.MunicipalRegistration, MainCnae: c.MainCnae,
                TaxRegime: c.TaxRegime, OpeningDate: c.OpeningDate, ContactName: "Carlos Dias")));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var r = (await response.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!.Registration!;
        Assert.Equal("2122223333", r.Phone);
        Assert.Equal("novo@acme.com.br", r.InvoiceEmail);
        Assert.Equal("Carlos Dias", r.ContactName);
    }

    [Fact]
    public async Task AnApprovedPersonalCustomer_KeepsTheCpfByLeavingItOut_ButCannotChangeItOrTheBirthDate()
    {
        var cpf = NewCpf();
        var (client, _) = await RegisterOkAsync("João", AccountType.Personal, Person(cpf), approve: true);

        // A request without the CPF leaves the stored one (the screens never get it back).
        var keep = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("João", null, new RegistrationRequest(BirthDate: Adult, Phone: "11 98888-7777")));
        Assert.Equal(HttpStatusCode.OK, keep.StatusCode);
        Assert.Equal(CpfRules.Mask(cpf), (await keep.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!.Registration!.CpfMasked);
        // The same CPF again is not a change.
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("João", null, Person(cpf)))).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("João", null, Person(NewCpf())))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("João", null, Person(cpf, new DateOnly(1991, 1, 1))))).StatusCode);
    }

    [Fact]
    public async Task APutWithoutRegistration_LeavesTheStoredDataAlone()
    {
        var (client, _) = await RegisterOkAsync("Acme", AccountType.Business, Company());
        var before = (await OwnAsync(client)).Registration!;

        var response = await client.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme Renamed"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var after = (await response.Content.ReadFromJsonAsync<ClientOwnProfileDto>())!;
        Assert.Equal("Acme Renamed", after.CompanyName);
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(before), System.Text.Json.JsonSerializer.Serialize(after.Registration));
    }

    // ---- AC-4: the admin has full control, audited

    [Fact]
    public async Task AnAdmin_ChangesTheVerifiedRecord_AndItIsAuditedWithBeforeAndAfter_CpfMasked()
    {
        var admin = await _factory.AdminAsync();
        var cpf = NewCpf();
        var (_, id) = await RegisterOkAsync("João", AccountType.Personal, Person(cpf), approve: true);

        var response = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration",
            new AdminRegistrationRequest("João Pedro da Silva", AccountType.Personal, new RegistrationRequest(BirthDate: new DateOnly(1989, 1, 5), Phone: "11 90000-1111")));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var staff = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!;
        Assert.Equal("João Pedro da Silva", staff.CompanyName);
        Assert.Equal(new DateOnly(1989, 1, 5), staff.Registration!.BirthDate);
        Assert.True(staff.Registration.HasCpf);

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = entries.First(e => e.EntityId == id && e.Action == "Update");
        var details = entry.Details["data"];
        Assert.Contains("\"Before\"", details);
        Assert.Contains("\"After\"", details);
        Assert.Contains("Pedro da Silva", details);
        Assert.Contains("***.", details);
        Assert.DoesNotContain(cpf, details);
        Assert.DoesNotContain(CpfRules.Format(cpf), details);
        Assert.NotNull(entry.EntityNumber);
    }

    [Fact]
    public async Task AnAdmin_CanEditASuspendedCustomer_AndFillInAMigratedCustomersMissingData()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterClientAsync();
        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();
        var cnpj = NewCnpj();

        var response = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Acme Co", AccountType.Business, new RegistrationRequest(Cnpj: cnpj)));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(cnpj, (await response.Content.ReadFromJsonAsync<RegistrationDto>())!.Cnpj);
    }

    [Fact]
    public async Task ChangingTheType_NeedsConfirmation_ThenClearsTheOtherTypesFields()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await RegisterOkAsync("Acme", AccountType.Business, Company(), approve: true);
        var request = new AdminRegistrationRequest("João Silva", AccountType.Personal, Person(NewCpf()));

        var refused = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", request);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(AccountType.Business, (await OwnAsync(client)).Registration!.AccountType);

        var confirmed = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", request with { ConfirmTypeChange = true });
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        var registration = (await OwnAsync(client)).Registration!;
        Assert.Equal(AccountType.Personal, registration.AccountType);
        Assert.Null(registration.Cnpj);
        Assert.Null(registration.LegalName);
        Assert.Null(registration.StateRegistration);
        Assert.True(registration.HasCpf);

        // And back: the CPF is cleared.
        var back = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Acme", AccountType.Business, new RegistrationRequest(Cnpj: NewCnpj()), true));
        Assert.Equal(HttpStatusCode.OK, back.StatusCode);
        Assert.False((await OwnAsync(client)).Registration!.HasCpf);
    }

    [Fact]
    public async Task TheAdminEdit_Validates_AndAnswers404ForAnUnknownCustomer()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await RegisterOkAsync("Acme", AccountType.Business, null);

        var bad = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Acme", AccountType.Business, new RegistrationRequest(Cnpj: "123")));
        Assert.Contains(await ProblemsAsync(bad), p => p.Contains("CNPJ"));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync($"/api/admin/clients/{Guid.NewGuid()}/registration", new AdminRegistrationRequest("A", AccountType.Business, null))).StatusCode);
    }

    // ---- AC-7: the audited reveal

    [Fact]
    public async Task ShowingTheCpf_IsAnAdminAction_ThatIsAudited_AndTheEntryHoldsOnlyTheMask()
    {
        var admin = await _factory.AdminAsync();
        var cpf = NewCpf();
        var (_, id) = await RegisterOkAsync("João", AccountType.Personal, Person(cpf));

        var response = await RevealAsync(admin, id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
        Assert.Equal(CpfRules.Format(cpf), (await response.Content.ReadFromJsonAsync<CpfRevealDto>())!.Cpf);
        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = entries.First(e => e.EntityId == id && e.Action == "Reveal");
        Assert.DoesNotContain(cpf, entry.Details["data"]);
        Assert.Contains("***.", entry.Details["data"]);
    }

    [Fact]
    public async Task ShowingTheCpf_IsRefusedForEveryoneButAdmins_AndFor404WhenThereIsNone()
    {
        var admin = await _factory.AdminAsync();
        var (customer, id) = await RegisterOkAsync("João", AccountType.Personal, Person(NewCpf()));
        var (_, businessId) = await RegisterOkAsync("Acme", AccountType.Business, null);

        Assert.Equal(HttpStatusCode.Forbidden, (await RevealAsync(customer, id)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RevealAsync(_factory.CreateClient(), id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await RevealAsync(admin, businessId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("x", AccountType.Business, null))).StatusCode);
    }

    // ---- AC-7, AC-9: staff views, masking, role access

    [Fact]
    public async Task StaffSeeTheTypeAndRegistration_TheCpfMasked_InTheDirectoryAndTheProfile()
    {
        var admin = await _factory.AdminAsync();
        var cpf = NewCpf();
        var (_, personId) = await RegisterOkAsync("Pessoa Visível Fulana", AccountType.Personal, Person(cpf));
        var (_, businessId) = await RegisterOkAsync("Empresa Visível Ltda", AccountType.Business, Company());

        var json = await admin.GetStringAsync($"/api/employee/clients/{personId}");
        Assert.DoesNotContain(cpf, json);
        Assert.DoesNotContain(CpfRules.Format(cpf), json);
        var person = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{personId}"))!;
        Assert.Matches(new Regex(@"^\*\*\*\.\d{3}\.\d{3}-\*\*$"), person.Registration!.CpfMasked!);
        var business = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{businessId}"))!;
        Assert.Equal(AccountType.Business, business.Registration!.AccountType);
        Assert.NotNull(business.Registration.Cnpj);

        var list = (await admin.GetFromJsonAsync<Marvi.Api.Features.Common.PagedResult<ClientSummaryDto>>("/api/employee/clients?search=Visível"))!;
        Assert.Equal([AccountType.Business, AccountType.Personal], list.Items.Select(i => i.AccountType).OrderBy(t => t));
        Assert.DoesNotContain(cpf, await admin.GetStringAsync("/api/employee/clients?search=Visível"));
    }

    [Fact]
    public async Task ACustomer_SeesOnlyTheirOwnRegistration_AndCannotReachAnothers()
    {
        var (alice, aliceId) = await RegisterOkAsync("Alice", AccountType.Personal, Person(NewCpf()));
        var (bob, _) = await RegisterOkAsync("Bob", AccountType.Business, Company());

        Assert.Equal(AccountType.Business, (await OwnAsync(bob)).Registration!.AccountType);
        Assert.Equal(aliceId, (await OwnAsync(alice)).Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.GetAsync($"/api/employee/clients/{aliceId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/api/client/profile")).StatusCode);
    }

    [Fact]
    public async Task RegistrationData_IsNeverInAPublicResponse()
    {
        var cpf = NewCpf();
        var cnpj = NewCnpj();
        await RegisterOkAsync("Dados Secretos", AccountType.Personal, Person(cpf));
        await RegisterOkAsync("Dados Empresa", AccountType.Business, new RegistrationRequest(Cnpj: cnpj));

        var anonymous = _factory.CreateClient();
        foreach (var url in new[] { "/api/products", "/api/categories", "/api/deals", "/api/stats", "/api/reviews" })
        {
            var response = await anonymous.GetAsync(url);
            var text = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain(cpf, text);
            Assert.DoesNotContain(cnpj, text);
        }

        var register = await RegisterAsync("Outro", AccountType.Personal, Person(NewCpf()));
        Assert.DoesNotContain("cpf", (await register.Content.ReadAsStringAsync()).ToLowerInvariant());
    }

    [Fact]
    public async Task TheCompletenessIndicator_ListsWhatIsMissing_AndNeverBlocksApproval()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await RegisterOkAsync("Acme", AccountType.Business, new RegistrationRequest(Cnpj: NewCnpj()));

        var missing = (await OwnAsync(client)).Registration!.Missing;
        Assert.DoesNotContain("cnpj", missing);
        Assert.Contains("legalName", missing);
        Assert.Contains("phone", missing);

        var tiers = (await admin.GetFromJsonAsync<List<Marvi.Api.Features.Catalog.Contracts.PricingTierDto>>("/api/admin/pricing-tiers"))!;
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/approve", new ApproveClientRequest(tiers.Single(t => t.IsDefault).Id))).StatusCode);
    }

    [Fact]
    public async Task AnExistingAccountWithoutRegistrationData_IsABusinessAccount()
    {
        var (client, _) = await _factory.RegisterClientAsync();
        var registration = (await OwnAsync(client)).Registration!;
        Assert.Equal(AccountType.Business, registration.AccountType);
        Assert.Null(registration.Cnpj);
    }
}
