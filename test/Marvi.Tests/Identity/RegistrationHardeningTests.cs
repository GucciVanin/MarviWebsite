using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Marvi.Tests.Identity;

/// <summary>
/// MRV-9.4 O-5: the security review's hardening (rate limits, one generic duplicate answer, the hash-key canary, no birth date in the audit trail, the reveal
/// reason, invisible characters, no-store) and the reviewer's follow-ups (field names in the 400, the admin edit's own conflict answer, the Brazil clock).
/// </summary>
public class RegistrationHardeningTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public RegistrationHardeningTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static int _seed = 40_000_000;

    private static string NewCnpj()
    {
        var root = Interlocked.Increment(ref _seed).ToString("D8") + "0001";
        return root + CnpjRules.CheckDigits(root);
    }

    private static string NewCpf()
    {
        var nine = (Interlocked.Increment(ref _seed) % 1_000_000_000).ToString("D9");
        string Dig(string s, int from)
        {
            var sum = 0;
            for (var i = 0; i < s.Length; i++) sum += (s[i] - '0') * (from - i);
            var r = sum % 11;
            return (r < 2 ? 0 : 11 - r).ToString();
        }

        var d1 = Dig(nine, 10);
        return nine + d1 + Dig(nine + d1, 11);
    }

    private static Task<HttpResponseMessage> Register(HttpClient client, RegistrationRequest? data, AccountType type = AccountType.Business, string name = "Acme") =>
        client.PostAsJsonAsync("/api/auth/register", new RegisterRequest($"{Guid.NewGuid()}@example.com", "Test1234!", name, TestAddresses.Main, type, data));

    // ---- M1, M2, L2: rate limits

    [Fact]
    public async Task Registration_ProfileSave_AndTheCpfReveal_AreEachRateLimited_WithRetryAfter()
    {
        using var factory = new TightFactory();
        var (customer, id) = await factory.RegisterPendingClientAsync(); // the first of the three registrations
        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Created, (await Register(anonymous, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Register(anonymous, null)).StatusCode);
        var limited = await Register(anonymous, null);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await customer.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest($"Acme {i}"))).StatusCode);
        }

        var saveLimited = await customer.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme 4"));
        Assert.Equal(HttpStatusCode.TooManyRequests, saveLimited.StatusCode);
        Assert.True(saveLimited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
        Assert.Equal(HttpStatusCode.OK, (await customer.GetAsync("/api/client/profile")).StatusCode); // reading is not limited

        var admin = await factory.AdminAsync();
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Pessoa", AccountType.Personal, new RegistrationRequest(Cpf: NewCpf(), BirthDate: new DateOnly(1990, 1, 1)), true))).EnsureSuccessStatusCode();
        for (var i = 0; i < 2; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/admin/clients/{id}/cpf/reveal", new RevealCpfRequest("Conferir o cadastro"))).StatusCode);
        }

        var revealLimited = await admin.PostAsJsonAsync($"/api/admin/clients/{id}/cpf/reveal", new RevealCpfRequest("Conferir o cadastro"));
        Assert.Equal(HttpStatusCode.TooManyRequests, revealLimited.StatusCode);
        Assert.True(revealLimited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    [Fact]
    public async Task TheDefaultRegistrationLimit_IsFivePerMinute()
    {
        using var factory = new DefaultLimitsFactory();
        var anonymous = factory.CreateClient();
        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.Created, (await Register(anonymous, null)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await Register(anonymous, null)).StatusCode);
    }

    // ---- M2: one generic duplicate answer

    [Fact]
    public async Task ADuplicateCnpjAndADuplicateCpf_GetTheSameAnswer_AtRegistrationAndOnTheProfile()
    {
        var cnpj = NewCnpj();
        var cpf = NewCpf();
        var anonymous = _factory.CreateClient();
        (await Register(anonymous, new RegistrationRequest(Cnpj: cnpj))).EnsureSuccessStatusCode();
        (await Register(anonymous, new RegistrationRequest(Cpf: cpf, BirthDate: new DateOnly(1990, 1, 1)), AccountType.Personal, "Pessoa")).EnsureSuccessStatusCode();

        var byCnpj = await Register(anonymous, new RegistrationRequest(Cnpj: cnpj));
        var byCpf = await Register(anonymous, new RegistrationRequest(Cpf: cpf, BirthDate: new DateOnly(1990, 1, 1)), AccountType.Personal, "Outra");

        Assert.Equal(HttpStatusCode.Conflict, byCnpj.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, byCpf.StatusCode);
        var a = await byCnpj.Content.ReadAsStringAsync();
        Assert.Equal(a, await byCpf.Content.ReadAsStringAsync());
        Assert.Contains("Não foi possível concluir o cadastro com estes dados. Se você já tem conta, entre ou fale conosco.", a);
        Assert.DoesNotContain("CNPJ", a);
        Assert.DoesNotContain("CPF", a);

        var (pending, _) = await _factory.RegisterPendingClientAsync();
        var profileCnpj = await pending.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme Co", null, new RegistrationRequest(Cnpj: cnpj)));
        var (pendingTwo, _) = await _factory.RegisterPendingClientAsync();
        var profileCpf = await pendingTwo.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Pessoa", AccountType.Personal, new RegistrationRequest(Cpf: cpf, BirthDate: new DateOnly(1990, 1, 1))));
        Assert.Equal(HttpStatusCode.Conflict, profileCnpj.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, profileCpf.StatusCode);
        Assert.Equal(await profileCnpj.Content.ReadAsStringAsync(), await profileCpf.Content.ReadAsStringAsync());
        Assert.Contains("Não foi possível concluir o cadastro", await profileCnpj.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task TheAdminEdit_AnswersADuplicateWithTheSameGenericText()
    {
        var cnpj = NewCnpj();
        (await Register(_factory.CreateClient(), new RegistrationRequest(Cnpj: cnpj))).EnsureSuccessStatusCode();
        var (_, id) = await _factory.RegisterPendingClientAsync();
        var admin = await _factory.AdminAsync();

        var response = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Acme Co", AccountType.Business, new RegistrationRequest(Cnpj: cnpj)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains(ClientRegistrationService.DuplicateMessage, await response.Content.ReadAsStringAsync());
    }

    // ---- R1: the admin edit's own conflict answer

    [Fact]
    public async Task TheAdminEdit_WhenTheCustomerChangedAtTheSameMoment_SaysSo_NotThatItIsADuplicate()
    {
        using var factory = new ConflictingAuditFactory();
        var (_, id) = await factory.RegisterPendingClientAsync();
        var admin = await factory.AdminAsync();
        factory.Conflict = true;

        var response = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Acme Co", AccountType.Business, new RegistrationRequest(Cnpj: NewCnpj())));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("changed at the same moment", body);
        Assert.DoesNotContain("Não foi possível concluir", body);
    }

    // ---- R3: the 400 names the field

    [Fact]
    public async Task TheBadRequest_IsAListOfFieldAndMessage()
    {
        var response = await Register(_factory.CreateClient(), new RegistrationRequest(Cnpj: "11222333000182", Phone: "12"), name: " ");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problems = (await response.Content.ReadFromJsonAsync<List<RegistrationProblem>>())!;
        Assert.Contains(problems, p => p.Field == "companyName" && p.Message.Contains("Nome da empresa"));
        Assert.Contains(problems, p => p.Field == "cnpj" && p.Message.Contains("CNPJ inválido"));
        Assert.Contains(problems, p => p.Field == "phone");
    }

    [Fact]
    public async Task TheProfileBadRequest_IsTheSameShape()
    {
        var (customer, _) = await _factory.RegisterPendingClientAsync();

        var response = await customer.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme Co", null, new RegistrationRequest(MainCnae: "12")));

        var problems = (await response.Content.ReadFromJsonAsync<List<RegistrationProblem>>())!;
        Assert.Equal("mainCnae", Assert.Single(problems).Field);
    }

    // ---- L1: no birth date in the audit trail

    [Fact]
    public async Task TheAuditTrail_NeverHoldsABirthDate_OnlyThatOneIsSetAndWhetherItChanged()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterPendingClientAsync();

        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Maria", AccountType.Personal, new RegistrationRequest(Cpf: NewCpf(), BirthDate: new DateOnly(1987, 6, 5)), true))).EnsureSuccessStatusCode();
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Maria", AccountType.Personal, new RegistrationRequest(BirthDate: new DateOnly(1988, 7, 6))))).EnsureSuccessStatusCode();

        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!.Where(e => e.EntityId == id && e.Action == "Update").ToList();
        Assert.Equal(2, entries.Count);
        foreach (var entry in entries)
        {
            var data = entry.Details["data"];
            Assert.DoesNotContain("1987", data);
            Assert.DoesNotContain("1988", data);
            Assert.Contains("\"HasBirthDate\":true", data);
        }

        Assert.Contains(entries, e => e.Details["data"].Contains("\"BirthDateChanged\":true"));
    }

    // ---- L2: the reveal needs a reason, stored in the audit entry

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("ab")]
    [InlineData("a\u200Bbc")]
    [InlineData("CPF 111.444.777-35 do cliente")]
    [InlineData("11144477735")]
    public async Task TheReveal_NeedsAReason_OfThreeToTwoHundredVisibleCharacters(string? reason)
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterPendingClientAsync();
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Pessoa", AccountType.Personal, new RegistrationRequest(Cpf: NewCpf(), BirthDate: new DateOnly(1990, 1, 1)), true))).EnsureSuccessStatusCode();

        var response = await admin.PostAsJsonAsync($"/api/admin/clients/{id}/cpf/reveal", new RevealCpfRequest(reason));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("reason", (await response.Content.ReadFromJsonAsync<List<RegistrationProblem>>())![0].Field);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/admin/clients/{id}/cpf/reveal", new RevealCpfRequest(new string('x', 201)))).StatusCode);
    }

    [Fact]
    public async Task TheRevealReason_IsStoredInTheAuditEntry_NextToTheMaskOnly()
    {
        var admin = await _factory.AdminAsync();
        var cpf = NewCpf();
        var (_, id) = await _factory.RegisterPendingClientAsync();
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Pessoa", AccountType.Personal, new RegistrationRequest(Cpf: cpf, BirthDate: new DateOnly(1990, 1, 1)), true))).EnsureSuccessStatusCode();

        (await admin.PostAsJsonAsync($"/api/admin/clients/{id}/cpf/reveal", new RevealCpfRequest("  Cliente pediu a nota fiscal  "))).EnsureSuccessStatusCode();

        var entry = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!.First(e => e.EntityId == id && e.Action == "Reveal");
        Assert.Contains("\"Reason\":\"Cliente pediu a nota fiscal\"", entry.Details["data"]);
        Assert.DoesNotContain(cpf, entry.Details["data"]);
    }

    // ---- L4: invisible characters

    [Theory]
    [InlineData("\u200B")] // zero-width space
    [InlineData("\u202E")] // right-to-left override
    [InlineData("\uFEFF")] // byte-order mark
    [InlineData("\u2028")] // line separator
    [InlineData("\u2066")] // left-to-right isolate
    public async Task InvisibleFormatCharacters_AreRefused_InNamesAndRegistrationText(string invisible)
    {
        var anonymous = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.BadRequest, (await Register(anonymous, null, name: $"Ac{invisible}me")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Register(anonymous, new RegistrationRequest(LegalName: $"Acme{invisible}"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Register(anonymous, new RegistrationRequest(ContactName: $"{invisible}Ana"))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Register(anonymous, new RegistrationRequest(LegalName: "Açaí & Café Ltda", ContactName: "José D'Ávila"), name: "Padaria Ação")).StatusCode);
    }

    [Fact]
    public void ATagCharacterOutsideTheBasicPlane_IsInvisibleToo()
    {
        Assert.True(RegistrationRules.ContainsInvisible("a" + char.ConvertFromUtf32(0xE0041)));
        Assert.True(RegistrationRules.ContainsInvisible("a\u200Bb"));
        Assert.False(RegistrationRules.ContainsInvisible("Açaí 😀 José"));
    }

    // ---- L5: no-store

    [Fact]
    public async Task TheProfileResponses_AreNotCached()
    {
        var (customer, id) = await _factory.RegisterPendingClientAsync();
        var admin = await _factory.AdminAsync();

        Assert.Contains("no-store", (await customer.GetAsync("/api/client/profile")).Headers.CacheControl!.ToString());
        Assert.Contains("no-store", (await customer.PutAsJsonAsync("/api/client/profile", new UpdateClientProfileRequest("Acme Co"))).Headers.CacheControl!.ToString());
        Assert.Contains("no-store", (await admin.GetAsync($"/api/employee/clients/{id}")).Headers.CacheControl!.ToString());
        Assert.Contains("no-store", (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/registration", new AdminRegistrationRequest("Acme Co", AccountType.Business, null))).Headers.CacheControl!.ToString());
        var number = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!.CustomerNumber;
        Assert.Contains("no-store", (await admin.GetAsync($"/api/employee/clients/by-number/{number}")).Headers.CacheControl!.ToString());
    }

    // ---- M4: the hash-key canary

    private static CpfProtector Protector(string key) =>
        new(new EphemeralDataProtectionProvider(), new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { [CpfProtector.HashKeySetting] = key }).Build());

    private static AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task TheCanary_IsRecordedOnce_ThenMatches_AndANewKeyIsAMismatch()
    {
        await using var db = NewDb();
        var key = new string('k', 40);

        Assert.Equal(CpfKeyCheckResult.Recorded, await CpfKeyCheck.RunAsync(db, Protector(key)));
        Assert.Equal(CpfKeyCheckResult.Matches, await CpfKeyCheck.RunAsync(db, Protector(key)));
        Assert.Equal(CpfKeyCheckResult.Mismatch, await CpfKeyCheck.RunAsync(db, Protector(new string('z', 40))));
        var stored = (await db.AppSettings.SingleAsync()).Value;
        Assert.Matches("^[0-9a-f]{64}$", stored);
        Assert.DoesNotContain(key, stored);
    }

    [Fact]
    public async Task AMismatch_RefusesToStartInProduction_AndOnlyWarnsInDevelopment()
    {
        await using var db = NewDb();
        await CpfKeyCheck.RunAsync(db, Protector(new string('k', 40)));
        var services = new ServiceCollection().AddSingleton(db).AddSingleton(Protector(new string('z', 40))).BuildServiceProvider();
        var warnings = new List<string>();

        var failure = await Assert.ThrowsAsync<InvalidOperationException>(() => CpfKeyCheck.EnsureAsync(services, new FakeEnvironment(Environments.Production), new ListLogger(warnings)));
        Assert.Contains("Refusing to start in Production", failure.Message);
        Assert.Contains("Privacy:CpfHashKey", failure.Message);
        Assert.DoesNotContain(new string('z', 40), failure.Message);

        await CpfKeyCheck.EnsureAsync(services, new FakeEnvironment(Environments.Development), new ListLogger(warnings));
        Assert.Single(warnings);
        Assert.Contains("Privacy:CpfHashKey", warnings[0]);
    }

    [Fact]
    public async Task AMatchingKey_StartsNormally_InProduction()
    {
        await using var db = NewDb();
        var services = new ServiceCollection().AddSingleton(db).AddSingleton(Protector(new string('k', 40))).BuildServiceProvider();

        await CpfKeyCheck.EnsureAsync(services, new FakeEnvironment(Environments.Production), new ListLogger(new List<string>()));
        await CpfKeyCheck.EnsureAsync(services, new FakeEnvironment(Environments.Production), new ListLogger(new List<string>()));
    }

    // ---- R6: the Brazil clock and non-ASCII look-alikes

    [Theory]
    [InlineData("2026-10-30T02:59:00Z", "2026-10-29")]
    [InlineData("2026-10-30T03:00:00Z", "2026-10-30")]
    [InlineData("2026-10-30T23:59:59Z", "2026-10-30")]
    [InlineData("2026-10-31T00:00:00Z", "2026-10-30")]
    [InlineData("2027-01-01T02:59:59Z", "2026-12-31")]
    public void TodayInBrazil_ChangesAtThreeInTheMorningUtc(string utc, string expected)
    {
        var clock = new FixedClock(DateTimeOffset.Parse(utc, System.Globalization.CultureInfo.InvariantCulture));

        Assert.Equal(DateOnly.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), new BrazilDate(clock).Today);
    }

    [Theory]
    [InlineData("12ÁBC34501DE35")] // an accented letter
    [InlineData("１１２２２３３３０００１８１")] // full-width digits
    [InlineData("11222333٠٠٠١٨١")] // Arabic-Indic digits
    [InlineData("12ABC34501DE3５")] // a full-width digit in a check position
    [InlineData("12abc34501dé35")]
    [InlineData("12\u017FBC34501DE35")] // long s, which ToUpperInvariant would turn into an S
    [InlineData("12\u212AB C34501DE35")] // Kelvin sign
    public void NonAsciiLookAlikes_AreNotACnpj(string typed) => Assert.False(CnpjRules.IsValid(CnpjRules.Normalize(typed)));

    [Theory]
    [InlineData("１１１４４４７７７３５")]
    [InlineData("١١١٤٤٤٧٧٧٣٥")]
    public void NonAsciiDigits_AreNotACpf(string typed) => Assert.False(CpfRules.IsValid(CpfRules.Normalize(typed)));

    // ---- hosts and fakes

    /// <summary>Three registrations, three profile saves and two reveals per minute.</summary>
    private sealed class TightFactory : MarviApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // The shared helpers register and sign in too: keep the auth budget wide and tighten only what this test is about, after setup.
                ["RateLimiting:Register:PermitLimit"] = "3",
                ["RateLimiting:Profile:PermitLimit"] = "3",
                ["RateLimiting:Reveal:PermitLimit"] = "2",
            }));
        }
    }

    /// <summary>The shipped defaults for registration (the shared factory raises them).</summary>
    private sealed class DefaultLimitsFactory : MarviApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["RateLimiting:Register:PermitLimit"] = "5" }));
        }
    }

    /// <summary>A host whose audit write fails like a concurrent change would (the customer row was changed under the admin's edit).</summary>
    private sealed class ConflictingAuditFactory : MarviApiFactory
    {
        public bool Conflict { get; set; }

        protected override void ConfigureDb(DbContextOptionsBuilder options) => options.AddInterceptors(new Conflicting(this));

        private sealed class Conflicting(ConflictingAuditFactory factory) : SaveChangesInterceptor
        {
            public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
            {
                if (factory.Conflict && eventData.Context!.ChangeTracker.Entries<Marvi.Domain.Auditing.AuditLogEntry>().Any(e => e.State == EntityState.Added))
                {
                    throw new DbUpdateConcurrencyException("Simulated concurrent change.", []);
                }

                return base.SavingChangesAsync(eventData, result, cancellationToken);
            }
        }
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Marvi.Tests";
        public string ContentRootPath { get; set; } = string.Empty;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }

    private sealed class ListLogger(List<string> warnings) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel == LogLevel.Warning)
            {
                warnings.Add(formatter(state, exception));
            }
        }
    }
}
