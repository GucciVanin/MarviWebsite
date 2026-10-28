using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Marvi.Infrastructure.Reviews;

/// <summary>
/// Reads the business's Google reviews with the Places API (New), MRV-2.5. The key travels in a request header, never in the
/// URL, so neither a log line nor an exception message can quote it. Settings: <c>Reviews:Google:ApiKey</c>,
/// <c>Reviews:Google:PlaceId</c> and, for tests and local fakes only, <c>Reviews:Google:BaseUrl</c>.
/// Google returns at most five reviews, chosen by Google; they are passed on as they are.
/// </summary>
public sealed class GooglePlacesReviewsProvider : IPlaceReviewsProvider
{
    private const string DefaultBaseUrl = "https://places.googleapis.com";
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(5);
    private const string FieldMask = "rating,userRatingCount,googleMapsUri,reviews";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GooglePlacesReviewsProvider> _logger;

    public GooglePlacesReviewsProvider(HttpClient httpClient, IConfiguration configuration, ILogger<GooglePlacesReviewsProvider> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<PlaceReviews?> GetAsync(CancellationToken cancellationToken)
    {
        var apiKey = _configuration["Reviews:Google:ApiKey"];
        var placeId = _configuration["Reviews:Google:PlaceId"];
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(placeId))
        {
            _logger.LogInformation("Reviews:Google:ApiKey / PlaceId are not configured; the Google reviews section stays hidden.");
            return null;
        }

        var configuredBase = _configuration["Reviews:Google:BaseUrl"];
        var baseUrl = (string.IsNullOrWhiteSpace(configuredBase) ? DefaultBaseUrl : configuredBase).TrimEnd('/');
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/v1/places/{Uri.EscapeDataString(placeId)}?languageCode=pt-BR");
        request.Headers.Add("X-Goog-Api-Key", apiKey);
        request.Headers.Add("X-Goog-FieldMask", FieldMask);

        // Google hanging must not hold the public endpoint open for the HttpClient default of 100 s.
        var caller = cancellationToken;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(caller);
        timeout.CancelAfter(RequestTimeout);
        cancellationToken = timeout.Token;
        try
        {
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Google Places reviews request failed with status {StatusCode}.", (int)response.StatusCode);
                return null;
            }

            using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            return Read(body.RootElement);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !caller.IsCancellationRequested)
        {
            _logger.LogWarning("Google Places reviews request failed: {Error}", ex.GetType().Name);
            return null;
        }
    }

    internal static PlaceReviews? Read(JsonElement root)
    {
        if (!root.TryGetProperty("rating", out var rating) || !rating.TryGetDouble(out var average)
            || !root.TryGetProperty("userRatingCount", out var count) || !count.TryGetInt32(out var total))
        {
            return null;
        }

        var reviews = new List<PlaceReview>();
        if (root.TryGetProperty("reviews", out var items) && items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                var review = ReadReview(item);
                if (review is not null)
                {
                    reviews.Add(review);
                }
            }
        }

        return new PlaceReviews(average, total, Text(root, "googleMapsUri"), reviews);
    }

    // A review is shown only with an author, a 1-5 star rating and some text (a stars-only review has nothing to quote).
    private static PlaceReview? ReadReview(JsonElement item)
    {
        if (!item.TryGetProperty("rating", out var stars) || !stars.TryGetInt32(out var rating) || rating is < 1 or > 5)
        {
            return null;
        }

        var text = item.TryGetProperty("text", out var textElement) ? Text(textElement, "text") : null;
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        string? author = null;
        string? authorUrl = null;
        if (item.TryGetProperty("authorAttribution", out var attribution) && attribution.ValueKind == JsonValueKind.Object)
        {
            author = Text(attribution, "displayName");
            authorUrl = Text(attribution, "uri");
        }

        if (string.IsNullOrWhiteSpace(author))
        {
            return null;
        }

        DateTimeOffset? published = DateTimeOffset.TryParse(Text(item, "publishTime"), out var parsed) ? parsed : null;
        return new PlaceReview(author.Trim(), authorUrl, rating, text.Trim(), Text(item, "relativePublishTimeDescription") ?? string.Empty, published);
    }

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
