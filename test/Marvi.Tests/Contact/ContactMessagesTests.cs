using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Admin.Contracts;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Contact.Contracts;
using Marvi.Domain.Contact;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Contact;

/// <summary>MRV-2.8a: the public contact form, the admin list and "handle", the pending-actions group, and the rate limit.</summary>
public class ContactMessagesTests
{
    private const string Url = "/api/public/contact";
    private const string AdminUrl = "/api/admin/contact-messages";

    private static ContactRequest Valid(string? name = "Maria Teste", string? email = "maria@contato.test", string? phone = "(11) 99999-0000",
        string? company = "Padaria Teste", string? message = "Gostaria de um orçamento de bebidas.", string? website = null) =>
        new(name, email, phone, company, message, website);

    private static async Task<List<ContactMessage>> StoredAsync(MarviApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().ContactMessages.AsNoTracking().ToListAsync();
    }

    private static async Task SeedAsync(MarviApiFactory factory, params (string Name, DateTime CreatedAt, bool Handled)[] rows)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var (name, createdAt, handled) in rows)
        {
            db.ContactMessages.Add(new ContactMessage
            {
                Id = Guid.NewGuid(), Name = name, Email = $"{name.ToLowerInvariant()}@contato.test", Message = "Mensagem de teste para o admin.",
                CreatedAt = createdAt, HandledAt = handled ? createdAt.AddMinutes(5) : null,
            });
        }

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task AValidMessage_IsAcceptedAnonymously_AndStoredUnhandledWithUtcDate()
    {
        await using var factory = new MarviApiFactory();
        var before = DateTime.UtcNow.AddSeconds(-1);

        var response = await factory.CreateClient().PostAsJsonAsync(Url, Valid());

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var stored = Assert.Single(await StoredAsync(factory));
        Assert.Equal("Maria Teste", stored.Name);
        Assert.Equal("maria@contato.test", stored.Email);
        Assert.Equal("(11) 99999-0000", stored.Phone);
        Assert.Equal("Padaria Teste", stored.Company);
        Assert.Equal("Gostaria de um orçamento de bebidas.", stored.Message);
        Assert.Null(stored.HandledAt);
        Assert.True(stored.CreatedAt >= before && stored.CreatedAt <= DateTime.UtcNow.AddSeconds(1));
    }

    [Fact]
    public async Task OptionalFieldsMayBeMissing_AndTextIsTrimmed()
    {
        await using var factory = new MarviApiFactory();

        var response = await factory.CreateClient().PostAsJsonAsync(Url, Valid(name: "  Maria  ", email: "  maria@contato.test ", phone: "  ", company: null, message: "   Mensagem com espaços ao redor.   "));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var stored = Assert.Single(await StoredAsync(factory));
        Assert.Equal("Maria", stored.Name);
        Assert.Equal("maria@contato.test", stored.Email);
        Assert.Null(stored.Phone);
        Assert.Null(stored.Company);
        Assert.Equal("Mensagem com espaços ao redor.", stored.Message);
    }

    [Fact]
    public async Task TheLimitsAreInclusive_ExactlyAtThemIsAccepted()
    {
        await using var factory = new MarviApiFactory();

        var response = await factory.CreateClient().PostAsJsonAsync(Url, Valid(
            name: new string('n', 100), email: new string('a', 188) + "@example.com", phone: new string('1', 30), company: new string('c', 150), message: new string('m', 2000)));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var shortest = await factory.CreateClient().PostAsJsonAsync(Url, Valid(message: "0123456789"));
        Assert.Equal(HttpStatusCode.NoContent, shortest.StatusCode);
    }

    public static IEnumerable<object?[]> Invalid() =>
    [
        ["name", null],
        ["name", "   "],
        ["name", new string('n', 101)],
        ["email", null],
        ["email", "not-an-email"],
        ["email", "Name <a@b.com>"],
        ["email", new string('a', 190) + "@example.com"],
        ["phone", new string('1', 31)],
        ["company", new string('c', 151)],
        ["message", null],
        ["message", "         "],
        ["message", "curta"],
        ["message", "   123456789   "],
        ["message", new string('m', 2001)],
        ["message", "texto com nul \0 no meio"],
    ];

    [Theory]
    [MemberData(nameof(Invalid))]
    public async Task InvalidInput_Is400WithTheFieldNamed_AndNothingIsStored(string field, string? value)
    {
        await using var factory = new MarviApiFactory();
        var request = field switch
        {
            "name" => Valid(name: value),
            "email" => Valid(email: value),
            "phone" => Valid(phone: value),
            "company" => Valid(company: value),
            _ => Valid(message: value),
        };

        var response = await factory.CreateClient().PostAsJsonAsync(Url, request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains($"\"{field}\"", body);
        if (!string.IsNullOrWhiteSpace(value) && value.Length < 100)
        {
            Assert.DoesNotContain(value.Trim(), body); // the visitor's text is never echoed back
        }

        Assert.Empty(await StoredAsync(factory));
    }

    [Fact]
    public async Task ABodyThatIsNotJson_Is400_AndNothingIsStored()
    {
        await using var factory = new MarviApiFactory();

        var response = await factory.CreateClient().PostAsync(Url, new StringContent("{ nope", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await StoredAsync(factory));
    }

    [Fact]
    public async Task AFilledHoneypot_Answers204_AndStoresNothing()
    {
        await using var factory = new MarviApiFactory();

        var response = await factory.CreateClient().PostAsJsonAsync(Url, Valid(website: "http://spam.example"));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await StoredAsync(factory));
    }

    [Fact]
    public async Task AWhitespaceOnlyHoneypot_IsStillABot_204AndNothingStored()
    {
        await using var factory = new MarviApiFactory();

        var response = await factory.CreateClient().PostAsJsonAsync(Url, Valid(website: "   "));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await StoredAsync(factory));
    }

    [Fact]
    public async Task AnOversizedBody_IsRefused_AndNothingIsStored()
    {
        await using var factory = new MarviApiFactory();

        var response = await factory.CreateClient().PostAsJsonAsync(Url, Valid(message: new string('m', 20 * 1024)));

        Assert.True(response.StatusCode is HttpStatusCode.RequestEntityTooLarge or HttpStatusCode.BadRequest, response.StatusCode.ToString());
        Assert.Empty(await StoredAsync(factory));
    }

    [Fact]
    public async Task TheSixthRequestFromTheSameAddress_Is429WithRetryAfter_ByDefault()
    {
        await using var factory = new DefaultLimitFactory();
        using var client = factory.CreateClient();

        for (var i = 0; i < 5; i++)
        {
            Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync(Url, Valid())).StatusCode);
        }

        var limited = await client.PostAsJsonAsync(Url, Valid());

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
        Assert.Equal(5, (await StoredAsync(factory)).Count);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task TheAdminList_RequiresAnAdmin()
    {
        await using var factory = new MarviApiFactory();
        var (customer, _) = await factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(AdminUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync(AdminUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().PostAsync($"{AdminUrl}/{Guid.NewGuid()}/handle", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.PostAsync($"{AdminUrl}/{Guid.NewGuid()}/handle", null)).StatusCode);
    }

    [Fact]
    public async Task TheAdminList_IsNewestFirst_FiltersByHandled_AndPages()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var now = DateTime.UtcNow;
        await SeedAsync(factory, ("Antiga", now.AddDays(-3), false), ("Atendida", now.AddDays(-2), true), ("Media", now.AddDays(-1), false), ("Recente", now, false));

        var all = (await admin.GetFromJsonAsync<PagedResult<ContactMessageDto>>(AdminUrl))!;
        var waiting = (await admin.GetFromJsonAsync<PagedResult<ContactMessageDto>>($"{AdminUrl}?handled=false"))!;
        var handled = (await admin.GetFromJsonAsync<PagedResult<ContactMessageDto>>($"{AdminUrl}?handled=true"))!;
        var secondPage = (await admin.GetFromJsonAsync<PagedResult<ContactMessageDto>>($"{AdminUrl}?handled=false&page=2&pageSize=2"))!;

        Assert.Equal(["Recente", "Media", "Atendida", "Antiga"], all.Items.Select(m => m.Name));
        Assert.Equal(4, all.TotalCount);
        Assert.Equal(["Recente", "Media", "Antiga"], waiting.Items.Select(m => m.Name));
        Assert.Equal(3, waiting.TotalCount);
        Assert.Equal("Atendida", Assert.Single(handled.Items).Name);
        Assert.NotNull(handled.Items[0].HandledAt);
        Assert.Equal("Antiga", Assert.Single(secondPage.Items).Name);
        Assert.Equal(3, secondPage.TotalCount);
        Assert.Equal(2, secondPage.Page);
        Assert.Equal(2, secondPage.PageSize);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"{AdminUrl}?page=0")).StatusCode);
    }

    [Fact]
    public async Task Handling_SetsTheDate_IsAudited_ThenAnswers409AndUnknownIs404()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        await factory.CreateClient().PostAsJsonAsync(Url, Valid());
        var id = (await admin.GetFromJsonAsync<PagedResult<ContactMessageDto>>(AdminUrl))!.Items.Single().Id;

        var handle = await admin.PostAsync($"{AdminUrl}/{id}/handle", null);

        Assert.Equal(HttpStatusCode.NoContent, handle.StatusCode);
        var stored = Assert.Single(await StoredAsync(factory));
        Assert.NotNull(stored.HandledAt);
        var audit = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log"))!;
        var entry = Assert.Single(audit, a => a.EntityName == nameof(ContactMessage));
        Assert.Equal(id, entry.EntityId);
        Assert.DoesNotContain("Maria", entry.Details.Values.Single()); // the audit entry carries no visitor text
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"{AdminUrl}/{id}/handle", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync($"{AdminUrl}/{Guid.NewGuid()}/handle", null)).StatusCode);
    }

    [Fact]
    public async Task PendingActions_GainAContactMessagesGroup_OfTheUnhandledOnes_NewestFirst_CountedInTheTotal()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var now = DateTime.UtcNow;
        await SeedAsync(factory, ("Antiga", now.AddDays(-2), false), ("Atendida", now.AddDays(-1), true), ("Recente", now, false));

        var pending = (await admin.GetFromJsonAsync<PendingActionsDto>("/api/admin/pending-actions"))!;

        Assert.Equal(2, pending.ContactMessages.Count);
        Assert.Equal(["Recente", "Antiga"], pending.ContactMessages.Items.Select(m => m.Name));
        var first = pending.ContactMessages.Items[0];
        Assert.Equal("recente@contato.test", first.Email);
        Assert.Equal("Mensagem de teste para o admin.", first.Message);
        Assert.Equal(2, pending.Total);

        var id = pending.ContactMessages.Items[0].Id;
        (await admin.PostAsync($"{AdminUrl}/{id}/handle", null)).EnsureSuccessStatusCode();
        var after = (await admin.GetFromJsonAsync<PendingActionsDto>("/api/admin/pending-actions"))!;
        Assert.Equal(1, after.ContactMessages.Count);
        Assert.Equal(1, after.Total);
    }

    [Fact]
    public async Task ThePendingContactGroup_ListsAtMostFifty_ButCountsAll()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var now = DateTime.UtcNow;
        await SeedAsync(factory, Enumerable.Range(0, 55).Select(i => ($"Pessoa{i}", now.AddMinutes(-i), false)).ToArray());

        var pending = (await admin.GetFromJsonAsync<PendingActionsDto>("/api/admin/pending-actions"))!;

        Assert.Equal(55, pending.ContactMessages.Count);
        Assert.Equal(50, pending.ContactMessages.Items.Count);
        Assert.Equal(55, pending.Total);
        Assert.Equal("Pessoa0", pending.ContactMessages.Items[0].Name);
    }

    /// <summary>Leaves the contact limit at its default (5 per window) while the rest stay generous.</summary>
    private sealed class DefaultLimitFactory : MarviApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimiting:Contact:PermitLimit"] = "5",
            }));
        }
    }
}
