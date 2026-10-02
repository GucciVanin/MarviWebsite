using Marvi.Api;
using Marvi.Api.Features.Identity;
using Marvi.Infrastructure.Data;
using Marvi.Infrastructure.Geocoding;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace Marvi.Tests.Support;

/// <summary>
/// Boots the real Api pipeline with the Postgres AppDbContext swapped for a private EF Core
/// InMemory database and the real geocoding provider swapped for <see cref="FakeGeocodingProvider"/>.
/// An Admin account is seeded so tests can drive the admin endpoints.
/// </summary>
public class MarviApiFactory : WebApplicationFactory<Program>
{
    public const string AdminEmail = "admin@marvi.test";
    public const string AdminPassword = "Admin-Test-1234!";

    private readonly string _dbName = Guid.NewGuid().ToString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            // AddDbContext composes options from IDbContextOptionsConfiguration<T> entries, so the
            // Npgsql configuration registered by AddInfrastructure must be removed too, not just
            // DbContextOptions<AppDbContext>, or both providers end up configured at once.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();

            services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(_dbName));

            services.RemoveAll<IGeocodingProvider>();
            services.AddScoped<IGeocodingProvider, FakeGeocodingProvider>();
        });
    }

    // Program.cs skips startup seeding in the Testing environment (the InMemory database has no migrations),
    // so run the same role/admin seeding the real startup performs. This app uses the minimal-hosting model,
    // so CreateHost (not CreateServer) is the override point that runs for WebApplication.CreateBuilder().
    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.ConfigureHostConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Seed:AdminEmail"] = AdminEmail,
            ["Seed:AdminPassword"] = AdminPassword
        }));

        var host = base.CreateHost(builder);

        using var scope = host.Services.CreateScope();
        IdentityModule.SeedRolesAsync(scope.ServiceProvider).GetAwaiter().GetResult();
        IdentityModule.SeedAdminAsync(scope.ServiceProvider, host.Services.GetRequiredService<IConfiguration>()).GetAwaiter().GetResult();

        return host;
    }
}
