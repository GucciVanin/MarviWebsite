using Marvi.Api.Features.Reviews.Contracts;
using Marvi.Infrastructure.Reviews;
using Microsoft.Extensions.Caching.Memory;

namespace Marvi.Api.Features.Reviews;

/// <summary>
/// The reviews the public home page shows (MRV-2.5). Visitors never reach Google: the answer is kept in memory, an hour by
/// default (<c>Reviews:CacheMinutes</c>), so cost and quota do not grow with traffic, and a failure is remembered for a few
/// minutes so an outage is not hammered. Only the fields the page renders leave the API, and links are kept only when they
/// are https links to Google, since the text came from a third party.
/// </summary>
public sealed class ReviewsService
{
    private const string CacheKey = "google-reviews";
    private static readonly TimeSpan FailureTtl = TimeSpan.FromMinutes(5);

    private readonly IPlaceReviewsProvider _provider;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _successTtl;
    private readonly SemaphoreSlim _refresh = new(1, 1);

    public ReviewsService(IPlaceReviewsProvider provider, IMemoryCache cache, IConfiguration configuration)
    {
        _provider = provider;
        _cache = cache;
        _successTtl = TimeSpan.FromMinutes(Math.Max(1, configuration.GetValue("Reviews:CacheMinutes", 60)));
    }

    /// <summary>The reviews to show, or null when there is nothing to show (the page then hides the section).</summary>
    public async Task<ReviewsDto?> GetAsync(CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue(CacheKey, out ReviewsDto? cached))
        {
            return cached;
        }

        await _refresh.WaitAsync(cancellationToken);
        try
        {
            if (_cache.TryGetValue(CacheKey, out cached))
            {
                return cached;
            }

            var fetched = await _provider.GetAsync(cancellationToken);
            var dto = fetched is null || fetched.Count <= 0 ? null : ToDto(fetched);
            _cache.Set(CacheKey, dto, dto is null ? FailureTtl : _successTtl);
            return dto;
        }
        finally
        {
            _refresh.Release();
        }
    }

    private static ReviewsDto ToDto(PlaceReviews source) => new(
        Math.Round(Math.Clamp(source.Rating, 0, 5), 1),
        source.Count,
        GoogleLink(source.ProfileUrl),
        source.Reviews.Select(r => new ReviewDto(r.AuthorName, GoogleLink(r.AuthorUrl), r.Rating, r.Text, r.RelativeTime)).ToList());

    private static string? GoogleLink(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps
        && (uri.Host == "google.com" || uri.Host.EndsWith(".google.com", StringComparison.OrdinalIgnoreCase) || uri.Host == "maps.app.goo.gl")
            ? uri.AbsoluteUri
            : null;
}
