using Marvi.Domain.Coverage;

namespace Marvi.Api.Features.Coverage;

public static class CoverageModule
{
    public static IServiceCollection AddCoverageFeature(this IServiceCollection services)
    {
        services.AddScoped<CoverageService>();
        return services;
    }
}
