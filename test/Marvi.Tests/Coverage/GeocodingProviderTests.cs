using System.Net;
using System.Text;
using Marvi.Infrastructure.Geocoding;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Marvi.Tests.Coverage;

/// <summary>
/// The geocoding adapters (MRV-4.8) against stubbed provider responses, no keys and no network: a location was found,
/// the address was not found, or the provider was unavailable (no key, refused key, outage, garbage).
/// </summary>
public class GeocodingProviderTests
{
    private const string Key = "SECRET-KEY-123";

    public enum Provider { Azure, Google }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<Uri> Requests { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!);
            return Task.FromResult(respond(request));
        }
    }

    private sealed class ListLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Messages.Add(formatter(state, exception) + (exception is null ? "" : " " + exception));
    }

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static (IGeocodingProvider Provider, StubHandler Handler, List<string> Logs) Build(
        Provider provider, Func<HttpRequestMessage, HttpResponseMessage> respond, string? apiKey = Key)
    {
        var handler = new StubHandler(respond);
        var http = new HttpClient(handler);
        var values = new Dictionary<string, string?>
        {
            ["Geocoding:AzureMaps:ApiKey"] = apiKey,
            ["Geocoding:Google:ApiKey"] = apiKey
        };
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        if (provider == Provider.Azure)
        {
            var logger = new ListLogger<AzureMapsGeocodingProvider>();
            return (new AzureMapsGeocodingProvider(http, configuration, logger), handler, logger.Messages);
        }

        var googleLogger = new ListLogger<GoogleMapsGeocodingProvider>();
        return (new GoogleMapsGeocodingProvider(http, configuration, googleLogger), handler, googleLogger.Messages);
    }

    private static string Found(Provider provider) => provider == Provider.Azure
        ? """{"results":[{"position":{"lat":-23.55,"lon":-46.63}}]}"""
        : """{"status":"OK","results":[{"geometry":{"location":{"lat":-23.55,"lng":-46.63}}}]}""";

    private static string Empty(Provider provider) => provider == Provider.Azure
        ? """{"results":[]}"""
        : """{"status":"ZERO_RESULTS","results":[]}""";

    [Theory]
    [InlineData(Provider.Azure)]
    [InlineData(Provider.Google)]
    public async Task AFoundAddress_ReturnsItsCoordinates(Provider provider)
    {
        var (geocoder, _, _) = Build(provider, _ => Json(Found(provider)));

        var outcome = await geocoder.GeocodeAsync("Av. Paulista, 1000");

        Assert.Equal(GeocodeStatus.Found, outcome.Status);
        Assert.Equal(new GeocodeResult(-23.55, -46.63), outcome.Location);
    }

    [Theory]
    [InlineData(Provider.Azure)]
    [InlineData(Provider.Google)]
    public async Task AnAddressTheProviderDoesNotKnow_IsNotFound_NotUnavailable(Provider provider)
    {
        var (geocoder, _, _) = Build(provider, _ => Json(Empty(provider)));

        var outcome = await geocoder.GeocodeAsync("nowhere at all");

        Assert.Equal(GeocodeStatus.NotFound, outcome.Status);
        Assert.Null(outcome.Location);
    }

    [Theory]
    [InlineData(Provider.Azure, HttpStatusCode.InternalServerError)]
    [InlineData(Provider.Azure, HttpStatusCode.Unauthorized)]
    [InlineData(Provider.Azure, HttpStatusCode.Forbidden)]
    [InlineData(Provider.Azure, HttpStatusCode.TooManyRequests)]
    [InlineData(Provider.Google, HttpStatusCode.InternalServerError)]
    [InlineData(Provider.Google, HttpStatusCode.TooManyRequests)]
    public async Task AProviderErrorStatus_IsUnavailable(Provider provider, HttpStatusCode status)
    {
        var (geocoder, _, _) = Build(provider, _ => Json("{}", status));

        Assert.Equal(GeocodeStatus.Unavailable, (await geocoder.GeocodeAsync("anywhere")).Status);
    }

    [Theory]
    [InlineData(Provider.Azure)]
    [InlineData(Provider.Google)]
    public async Task ANetworkFailure_IsUnavailable(Provider provider)
    {
        var (geocoder, _, _) = Build(provider, _ => throw new HttpRequestException("connection refused"));

        Assert.Equal(GeocodeStatus.Unavailable, (await geocoder.GeocodeAsync("anywhere")).Status);
    }

    [Theory]
    [InlineData(Provider.Azure)]
    [InlineData(Provider.Google)]
    public async Task AnUnreadableResponse_IsUnavailable(Provider provider)
    {
        var (geocoder, _, _) = Build(provider, _ => Json("<html>gateway error</html>"));

        Assert.Equal(GeocodeStatus.Unavailable, (await geocoder.GeocodeAsync("anywhere")).Status);
    }

    [Theory]
    [InlineData(Provider.Azure, null)]
    [InlineData(Provider.Azure, "  ")]
    [InlineData(Provider.Google, null)]
    [InlineData(Provider.Google, "")]
    public async Task AMissingKey_IsUnavailable_AndNoRequestIsSent(Provider provider, string? key)
    {
        var (geocoder, handler, _) = Build(provider, _ => Json(Found(provider)), apiKey: key);

        Assert.Equal(GeocodeStatus.Unavailable, (await geocoder.GeocodeAsync("anywhere")).Status);
        Assert.Empty(handler.Requests);
    }

    // Google answers a refused key or an exhausted quota with HTTP 200 and a status field; that is the provider failing, not the address.
    [Theory]
    [InlineData("REQUEST_DENIED")]
    [InlineData("OVER_QUERY_LIMIT")]
    [InlineData("OVER_DAILY_LIMIT")]
    [InlineData("UNKNOWN_ERROR")]
    public async Task GoogleStatusesThatMeanTheProviderFailed_AreUnavailable(string status)
    {
        var (geocoder, _, _) = Build(Provider.Google, _ => Json($$"""{"status":"{{status}}","results":[]}"""));

        Assert.Equal(GeocodeStatus.Unavailable, (await geocoder.GeocodeAsync("anywhere")).Status);
    }

    [Theory]
    [InlineData(Provider.Azure)]
    [InlineData(Provider.Google)]
    public async Task TheRequestCarriesTheEncodedAddressAndTheKey(Provider provider)
    {
        var (geocoder, handler, _) = Build(provider, _ => Json(Found(provider)));

        await geocoder.GeocodeAsync("Rua A, 10 & Cia");

        var uri = Assert.Single(handler.Requests).AbsoluteUri;
        Assert.Contains(Uri.EscapeDataString("Rua A, 10 & Cia"), uri);
        Assert.Contains(Key, uri);
    }

    [Theory]
    [InlineData(Provider.Azure)]
    [InlineData(Provider.Google)]
    public async Task TheKeyIsNeverWrittenToTheLogs_WhateverGoesWrong(Provider provider)
    {
        var failures = new List<Func<HttpRequestMessage, HttpResponseMessage>>
        {
            _ => Json("{}", HttpStatusCode.Forbidden),
            _ => throw new HttpRequestException($"failed calling https://example.test/?key={Key}"),
            _ => Json("not json")
        };

        foreach (var failure in failures)
        {
            var (geocoder, _, logs) = Build(provider, failure);
            await geocoder.GeocodeAsync("anywhere");
            Assert.NotEmpty(logs);
            Assert.DoesNotContain(logs, line => line.Contains(Key));
        }
    }
}
