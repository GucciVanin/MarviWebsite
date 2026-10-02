using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Marvi.Infrastructure.Geocoding;

public class AzureMapsGeocodingProvider : IGeocodingProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AzureMapsGeocodingProvider> _logger;

    public AzureMapsGeocodingProvider(HttpClient httpClient, IConfiguration configuration, ILogger<AzureMapsGeocodingProvider> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<GeocodeResult?> GeocodeAsync(string address)
    {
        var apiKey = _configuration["Geocoding:AzureMaps:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Geocoding:AzureMaps:ApiKey is not configured.");
            return null;
        }

        try
        {
            var requestUri = $"https://atlas.microsoft.com/search/address/json?api-version=1.0&subscription-key={Uri.EscapeDataString(apiKey)}&query={Uri.EscapeDataString(address)}";
            using var response = await _httpClient.GetAsync(requestUri);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Azure Maps geocoding request failed with status {StatusCode}.", response.StatusCode);
                return null;
            }

            var result = await response.Content.ReadFromJsonAsync<AzureMapsSearchResponse>();
            var position = result?.Results?.FirstOrDefault()?.Position;
            if (position is null)
            {
                return null;
            }

            return new GeocodeResult(position.Lat, position.Lon);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Azure Maps geocoding request threw an exception.");
            return null;
        }
    }

    private sealed class AzureMapsSearchResponse
    {
        public List<AzureMapsResult>? Results { get; set; }
    }

    private sealed class AzureMapsResult
    {
        public AzureMapsPosition? Position { get; set; }
    }

    private sealed class AzureMapsPosition
    {
        public double Lat { get; set; }
        public double Lon { get; set; }
    }
}
