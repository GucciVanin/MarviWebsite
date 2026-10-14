using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Marvi.Infrastructure.Geocoding;

public class AzureMapsGeocodingProvider : HttpGeocodingProvider
{
    public AzureMapsGeocodingProvider(HttpClient httpClient, IConfiguration configuration, ILogger<AzureMapsGeocodingProvider> logger)
        : base(httpClient, configuration, logger)
    {
    }

    protected override string ProviderName => "Azure Maps";

    protected override string ApiKeySetting => "Geocoding:AzureMaps:ApiKey";

    protected override Uri BuildRequestUri(string apiKey, string address) =>
        new($"https://atlas.microsoft.com/search/address/json?api-version=1.0&subscription-key={Uri.EscapeDataString(apiKey)}&query={Uri.EscapeDataString(address)}");

    // Azure signals every failure (bad key, quota) with an HTTP error status, so a 200 with no result is a genuine "not found".
    protected override GeocodeOutcome ReadOutcome(JsonDocument body)
    {
        if (!body.RootElement.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
        {
            return GeocodeOutcome.Unavailable;
        }

        foreach (var result in results.EnumerateArray())
        {
            if (result.TryGetProperty("position", out var position)
                && position.TryGetProperty("lat", out var lat) && position.TryGetProperty("lon", out var lon))
            {
                return GeocodeOutcome.Found(lat.GetDouble(), lon.GetDouble());
            }

            break; // the first result is the best match; without a position there is nothing to use
        }

        return GeocodeOutcome.NotFound;
    }
}
