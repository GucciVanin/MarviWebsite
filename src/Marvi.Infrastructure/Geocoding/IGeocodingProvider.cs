namespace Marvi.Infrastructure.Geocoding;

public interface IGeocodingProvider
{
    Task<GeocodeOutcome> GeocodeAsync(string address);
}

public record GeocodeResult(double Lat, double Lng);

public enum GeocodeStatus
{
    /// <summary>The provider located the address.</summary>
    Found,

    /// <summary>The provider answered and does not know the address. A fact about the address.</summary>
    NotFound,

    /// <summary>The provider could not answer (no or refused key, quota, outage, unreadable answer). A fact about the provider, not the address.</summary>
    Unavailable
}

/// <summary>
/// What geocoding an address came to. Callers must be able to tell "this address does not exist" from "we could not ask":
/// both used to be an empty result, so a missing API key looked exactly like an address outside the delivery area.
/// </summary>
public record GeocodeOutcome(GeocodeStatus Status, GeocodeResult? Location = null)
{
    public static GeocodeOutcome Found(double lat, double lng) => new(GeocodeStatus.Found, new GeocodeResult(lat, lng));

    public static GeocodeOutcome NotFound { get; } = new(GeocodeStatus.NotFound);

    public static GeocodeOutcome Unavailable { get; } = new(GeocodeStatus.Unavailable);
}
