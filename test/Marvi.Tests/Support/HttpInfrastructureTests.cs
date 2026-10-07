using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Http;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Http;
using Npgsql;

namespace Marvi.Tests.Support;

public class HttpInfrastructureTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public HttpInfrastructureTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    // ---- UtcDateTimeConverter
    private static DateTime Read(string json)
    {
        var options = new JsonSerializerOptions { Converters = { new UtcDateTimeConverter() } };
        return JsonSerializer.Deserialize<DateTime>(json, options);
    }

    [Theory]
    [InlineData("\"2026-10-01T00:00:00\"")] // no zone
    [InlineData("\"2026-10-01\"")] // date only
    [InlineData("\"2026-10-01T00:00:00Z\"")] // already UTC
    public void UtcDateTimeConverter_ReadsEveryZoneLessOrUtcFormAsUtc(string json)
    {
        var value = Read(json);
        Assert.Equal(DateTimeKind.Utc, value.Kind);
        Assert.Equal(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), value);
    }

    [Fact]
    public void UtcDateTimeConverter_ConvertsAnOffsetToTheSameInstantInUtc()
    {
        var value = Read("\"2026-10-01T03:00:00-03:00\"");
        Assert.Equal(DateTimeKind.Utc, value.Kind);
        Assert.Equal(new DateTime(2026, 10, 1, 6, 0, 0, DateTimeKind.Utc), value);
    }

    // ---- bad-text handling
    [Theory]
    [InlineData("22021", true)] // invalid byte sequence (NUL)
    [InlineData("22P05", true)]
    [InlineData("23505", false)]
    [InlineData("40001", false)]
    public void PostgresInputErrors_RecognisesOnlyInvalidTextEvenWhenWrapped(string sqlState, bool expected)
    {
        var postgres = new PostgresException("boom", "ERROR", "ERROR", sqlState);
        var wrapped = new InvalidOperationException("outer", new InvalidOperationException("middle", postgres));

        Assert.Equal(expected, PostgresInputErrors.IsInvalidText(wrapped));
    }

    [Fact]
    public void PostgresInputErrors_IgnoresExceptionsWithNoPostgresCause()
    {
        Assert.False(PostgresInputErrors.IsInvalidText(new TimeoutException()));
        Assert.False(PostgresInputErrors.IsInvalidText(new InvalidOperationException("x", new ArgumentException("y"))));
    }

    [Fact]
    public async Task InvalidTextExceptionHandler_AnswersWith400ForBadText_AndLeavesOtherErrorsAlone()
    {
        var handler = new InvalidTextExceptionHandler();
        var badText = new DefaultHttpContext();
        badText.Response.Body = new MemoryStream();
        var other = new DefaultHttpContext();

        var handledBadText = await handler.TryHandleAsync(badText, new PostgresException("x", "ERROR", "ERROR", "22021"), CancellationToken.None);
        var handledOther = await handler.TryHandleAsync(other, new InvalidOperationException("db down"), CancellationToken.None);

        Assert.True(handledBadText);
        Assert.Equal(StatusCodes.Status400BadRequest, badText.Response.StatusCode);
        Assert.False(handledOther);
        Assert.Equal(StatusCodes.Status200OK, other.Response.StatusCode);
    }

    // ---- audit log paging
    [Theory]
    [InlineData("page=0")]
    [InlineData("page=-5")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=-1")]
    public async Task AuditLog_RejectsNonsensePaging(string query)
    {
        var admin = await _factory.AdminAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/admin/audit-log?{query}")).StatusCode);
    }

    [Fact]
    public async Task AuditLog_CapsPageSize_AndSurvivesAHugePageNumber()
    {
        var admin = await _factory.AdminAsync();
        for (var i = 0; i < 3; i++)
        {
            await admin.CreateProductAsync();
        }

        var huge = await admin.GetAsync("/api/admin/audit-log?page=2147483647&pageSize=2147483647");
        var capped = await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=1");

        Assert.Equal(HttpStatusCode.OK, huge.StatusCode);
        Assert.Empty((await huge.Content.ReadFromJsonAsync<List<AuditLogEntryDto>>())!);
        Assert.Single(capped!);
    }

    // ---- malformed bodies are client errors
    [Theory]
    [InlineData("{\"email\": ")]
    [InlineData("[1,2,3]")]
    [InlineData("null")]
    [InlineData("")]
    public async Task MalformedJson_IsA4xx_NeverA500(string body)
    {
        var response = await _factory.CreateClient().PostAsync("/api/auth/login", new StringContent(body, Encoding.UTF8, "application/json"));
        Assert.InRange((int)response.StatusCode, 400, 499);
    }
}
