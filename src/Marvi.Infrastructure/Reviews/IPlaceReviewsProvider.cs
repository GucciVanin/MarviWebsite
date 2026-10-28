namespace Marvi.Infrastructure.Reviews;

/// <summary>One public review of the business, as the review source returned it (MRV-2.5).</summary>
public sealed record PlaceReview(string AuthorName, string? AuthorUrl, int Rating, string Text, string RelativeTime, DateTimeOffset? PublishedAt);

/// <summary>The business's public rating and the reviews the source chose to return.</summary>
public sealed record PlaceReviews(double Rating, int Count, string? ProfileUrl, IReadOnlyList<PlaceReview> Reviews);

public interface IPlaceReviewsProvider
{
    /// <summary>The current reviews, or null when they are unavailable (not configured, refused, outage, unreadable answer).</summary>
    Task<PlaceReviews?> GetAsync(CancellationToken cancellationToken);
}
