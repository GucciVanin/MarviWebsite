namespace Marvi.Api.Features.Reviews.Contracts;

public record ReviewDto(string AuthorName, string? AuthorUrl, int Rating, string Text, string RelativeTime);

public record ReviewsDto(double Rating, int Count, string? ProfileUrl, IReadOnlyList<ReviewDto> Reviews);
