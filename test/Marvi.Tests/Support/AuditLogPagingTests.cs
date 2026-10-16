using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Support;

/// <summary>MRV-2.4b.6: the audit log says how many entries there are in total, so a screen can page through it.</summary>
public class AuditLogPagingTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public AuditLogPagingTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task TheAuditLog_ReportsTheTotalNumberOfEntries_InAHeader_WhateverThePageSize()
    {
        var admin = await _factory.AdminAsync();
        for (var i = 0; i < 3; i++)
        {
            (await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest($"Audit page {Guid.NewGuid():N}", i, true))).EnsureSuccessStatusCode();
        }

        var firstPage = await admin.GetAsync("/api/admin/audit-log?page=1&pageSize=2");
        var everything = await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200");

        Assert.Equal(HttpStatusCode.OK, firstPage.StatusCode);
        Assert.Equal(2, (await firstPage.Content.ReadFromJsonAsync<List<AuditLogEntryDto>>())!.Count);
        var total = int.Parse(firstPage.Headers.GetValues("X-Total-Count").Single());
        Assert.True(total >= 3);
        // The whole log may hold more than the 200 the cap lets one request fetch, so the total is at least what was fetched.
        Assert.True(total >= everything!.Count);
    }
}
