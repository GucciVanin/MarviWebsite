using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Marvi.Infrastructure.Geocoding;

/// <summary>
/// What every HTTP geocoding provider shares (MRV-4.8): read the key, send one request, tell "unavailable" from "not
/// found", and never write the key to a log. An adapter only says where its key lives, how its URL looks and how to read
/// its answer.
/// </summary>
public abstract class HttpGeocodingProvider : IGeocodingProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger _logger;

    protected HttpGeocodingProvider(HttpClient httpClient, IConfiguration configuration, ILogger logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>For log messages, e.g. "Azure Maps".</summary>
    protected abstract string ProviderName { get; }

    /// <summary>Where the key is configured, e.g. "Geocoding:AzureMaps:ApiKey".</summary>
    protected abstract string ApiKeySetting { get; }

    protected abstract Uri BuildRequestUri(string apiKey, string address);

    /// <summary>Reads the provider's answer. The body is JSON; anything unreadable is reported as unavailable by the caller.</summary>
    protected abstract GeocodeOutcome ReadOutcome(JsonDocument body);

    public async Task<GeocodeOutcome> GeocodeAsync(string address)
    {
        var apiKey = _configuration[ApiKeySetting];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("{Setting} is not configured; {Provider} geocoding is unavailable.", ApiKeySetting, ProviderName);
            return GeocodeOutcome.Unavailable;
        }

        try
        {
            using var response = await _httpClient.GetAsync(BuildRequestUri(apiKey, address));
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("{Provider} geocoding request failed with status {StatusCode}.", ProviderName, (int)response.StatusCode);
                return GeocodeOutcome.Unavailable;
            }

            using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var outcome = ReadOutcome(body);
            if (outcome.Status == GeocodeStatus.Unavailable)
            {
                _logger.LogWarning("{Provider} geocoding answered but reported a failure.", ProviderName);
            }

            return outcome;
        }
        catch (Exception ex)
        {
            // Name the failure, but never echo its text unredacted: a request error can quote the URL, and the URL carries the key.
            _logger.LogWarning("{Provider} geocoding request failed: {Error}", ProviderName, Redact(ex.GetType().Name + ": " + ex.Message, apiKey));
            return GeocodeOutcome.Unavailable;
        }
    }

    private static string Redact(string text, string secret) => text.Replace(secret, "***");
}
