using Marvi.Infrastructure.Geocoding;

namespace Marvi.Tests.Support;

/// <summary>
/// Avoids real network calls: addresses of the form "lat,lng" resolve to that coordinate,
/// anything else simulates a geocoding failure (returns null).
/// </summary>
public class FakeGeocodingProvider : IGeocodingProvider
{
    public Task<GeocodeResult?> GeocodeAsync(string address)
    {
        var parts = address.Split(',');
        if (parts.Length == 2
            && double.TryParse(parts[0], out var lat)
            && double.TryParse(parts[1], out var lng))
        {
            return Task.FromResult<GeocodeResult?>(new GeocodeResult(lat, lng));
        }

        return Task.FromResult<GeocodeResult?>(null);
    }
}
