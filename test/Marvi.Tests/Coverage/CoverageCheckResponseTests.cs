using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Coverage;

/// <summary>
/// What a visitor is told by the coverage check (MRV-4.8): the geocoding outcome is internal, so an address the provider
/// does not know and a provider that is down both get the same plain "not covered" answer they always did.
/// </summary>
public class CoverageCheckResponseTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CoverageCheckResponseTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("an address nobody has heard of")]
    [InlineData(FakeGeocodingProvider.UnavailableAddress)]
    public async Task AnAddressThatCannotBeLocated_IsNotCovered_WhateverTheReason(string address)
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/coverage/check", new CoverageCheckRequest(address));
        var result = await response.Content.ReadFromJsonAsync<CoverageCheckResultDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(result!.Supported);
        Assert.Null(result.WarehouseName);
    }
}
