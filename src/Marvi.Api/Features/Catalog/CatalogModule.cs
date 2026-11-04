using Marvi.Api.Features.Catalog.Media;
using Marvi.Domain.Catalog;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Marvi.Api.Features.Catalog;

public static class CatalogModule
{
    public static IServiceCollection AddCatalogFeature(this IServiceCollection services)
    {
        services.AddScoped<PricingService>();
        services.AddScoped<BasketPricingService>();
        services.AddScoped<PricingDataLoader>();
        // Product photos (MRV-9.7): the folder on the media volume, the linking/cleanup service. The cleanup worker is added by Program (not in tests).
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<ProductPhotoStorage>();
        services.AddScoped<ProductPhotoService>();
        return services;
    }
}
