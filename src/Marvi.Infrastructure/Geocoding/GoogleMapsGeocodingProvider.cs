using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Marvi.Infrastructure.Geocoding;

public class GoogleMapsGeocodingProvider : HttpGeocodingProvider
{
    public GoogleMapsGeocodingProvider(HttpClient httpClient, IConfiguration configuration, ILogger<GoogleMapsGeocodingProvider> logger)
        : base(httpClient, configuration, logger)
    {
    }

    protected override string ProviderName => "Google Maps";

    protected override string ApiKeySetting => "Geocoding:Google:ApiKey";

    protected override Uri BuildRequestUri(string apiKey, string address) =>
        new($"https://maps.googleapis.com/maps/api/geocode/json?address={Uri.EscapeDataString(address)}&key={Uri.EscapeDataString(apiKey)}");

    // Google answers a refused key or an exhausted quota with HTTP 200 and a status field, so the status decides:
    // only ZERO_RESULTS means the address is unknown; any other non-OK status is the provider failing.
    protected override GeocodeOutcome ReadOutcome(JsonDocument body)
    {
        var root = body.RootElement;
        var status = root.TryGetProperty("status", out var statusElement) ? statusElement.GetString() : null;
        if (status is not null && status != "OK" && status != "ZERO_RESULTS")
        {
            return GeocodeOutcome.Unavailable;
        }

        if (!root.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
        {
            return GeocodeOutcome.Unavailable;
        }

        foreach (var result in results.EnumerateArray())
        {
            if (result.TryGetProperty("geometry", out var geometry) && geometry.TryGetProperty("location", out var location)
                && location.TryGetProperty("lat", out var lat) && location.TryGetProperty("lng", out var lng))
            {
                return GeocodeOutcome.Found(lat.GetDouble(), lng.GetDouble());
            }

            break;
        }

        return GeocodeOutcome.NotFound;
    }
}
