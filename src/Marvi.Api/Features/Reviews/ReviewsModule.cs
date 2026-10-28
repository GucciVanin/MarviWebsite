using Marvi.Infrastructure.Reviews;

namespace Marvi.Api.Features.Reviews;

public static class ReviewsModule
{
    public static IServiceCollection AddReviewsFeature(this IServiceCollection services)
    {
        services.AddMemoryCache();
        services.AddSingleton<IPlaceReviewsProvider, GooglePlacesReviewsProvider>();
        services.AddSingleton<ReviewsService>();
        return services;
    }
}
