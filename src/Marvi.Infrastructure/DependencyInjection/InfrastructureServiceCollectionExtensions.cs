using Marvi.Infrastructure.Data;
using Marvi.Infrastructure.Geocoding;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Infrastructure.DependencyInjection;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options => options
            .UseNpgsql(configuration.GetConnectionString("AppDb"))
            .UseSnakeCaseNamingConvention());

        services.AddIdentityCore<ApplicationUser>()
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>();

        services.AddSingleton<HttpClient>();

        var provider = configuration["Geocoding:Provider"];
        if (string.Equals(provider, "Google", StringComparison.OrdinalIgnoreCase))
        {
            services.AddScoped<IGeocodingProvider, GoogleMapsGeocodingProvider>();
        }
        else
        {
            services.AddScoped<IGeocodingProvider, AzureMapsGeocodingProvider>();
        }

        return services;
    }
}
