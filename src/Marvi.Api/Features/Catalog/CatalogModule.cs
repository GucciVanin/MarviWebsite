using Marvi.Domain.Catalog;

namespace Marvi.Api.Features.Catalog;

public static class CatalogModule
{
    public static IServiceCollection AddCatalogFeature(this IServiceCollection services)
    {
        services.AddScoped<PricingService>();
        services.AddScoped<BasketPricingService>();
        services.AddScoped<PricingDataLoader>();
        return services;
    }
}
