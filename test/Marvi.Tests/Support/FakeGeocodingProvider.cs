using Marvi.Infrastructure.Geocoding;

namespace Marvi.Tests.Support;

/// <summary>
/// Avoids real network calls: addresses of the form "lat,lng" resolve to that coordinate, the address "unavailable"
/// simulates the provider being down, and anything else is an address the provider does not know.
/// </summary>
public class FakeGeocodingProvider : IGeocodingProvider
{
    public const string UnavailableAddress = "unavailable";

    public Task<GeocodeOutcome> GeocodeAsync(string address)
    {
        if (address == UnavailableAddress)
        {
            return Task.FromResult(GeocodeOutcome.Unavailable);
        }

        var parts = address.Split(',');
        if (parts.Length == 2
            && double.TryParse(parts[0], out var lat)
            && double.TryParse(parts[1], out var lng))
        {
            return Task.FromResult(GeocodeOutcome.Found(lat, lng));
        }

        return Task.FromResult(GeocodeOutcome.NotFound);
    }
}
