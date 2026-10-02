using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Marvi.Infrastructure.Geocoding;

public class GoogleMapsGeocodingProvider : IGeocodingProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GoogleMapsGeocodingProvider> _logger;

    public GoogleMapsGeocodingProvider(HttpClient httpClient, IConfiguration configuration, ILogger<GoogleMapsGeocodingProvider> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<GeocodeResult?> GeocodeAsync(string address)
    {
        var apiKey = _configuration["Geocoding:Google:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Geocoding:Google:ApiKey is not configured.");
            return null;
        }

        try
        {
            var requestUri = $"https://maps.googleapis.com/maps/api/geocode/json?address={Uri.EscapeDataString(address)}&key={Uri.EscapeDataString(apiKey)}";
            using var response = await _httpClient.GetAsync(requestUri);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Google Maps geocoding request failed with status {StatusCode}.", response.StatusCode);
                return null;
            }

            var result = await response.Content.ReadFromJsonAsync<GoogleGeocodeResponse>();
            var location = result?.Results?.FirstOrDefault()?.Geometry?.Location;
            if (location is null)
            {
                return null;
            }

            return new GeocodeResult(location.Lat, location.Lng);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google Maps geocoding request threw an exception.");
            return null;
        }
    }

    private sealed class GoogleGeocodeResponse
    {
        public List<GoogleResult>? Results { get; set; }
    }

    private sealed class GoogleResult
    {
        public GoogleGeometry? Geometry { get; set; }
    }

    private sealed class GoogleGeometry
    {
        public GoogleLocation? Location { get; set; }
    }

    private sealed class GoogleLocation
    {
        public double Lat { get; set; }
        public double Lng { get; set; }
    }
}
