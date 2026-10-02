namespace Marvi.Infrastructure.Geocoding;

public interface IGeocodingProvider
{
    Task<GeocodeResult?> GeocodeAsync(string address);
}

public record GeocodeResult(double Lat, double Lng);
