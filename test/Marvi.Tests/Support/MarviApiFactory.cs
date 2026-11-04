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
    /// <summary>The pinned "today" of the registration rules in the API tests.</summary>
    public static readonly DateOnly Today = new(2026, 10, 30);

    private readonly string _dbName = Guid.NewGuid().ToString();
    /// <summary>The media folder of this host (product photos, MRV-9.7): a private temp folder, removed when the host is disposed.</summary>
    public string MediaPath { get; } = Path.Combine(Path.GetTempPath(), "marvi-test-media-" + Guid.NewGuid().ToString("N"));
    /// <summary>The clock the API uses; tests move it to age an upload past its hour.</summary>
    public AdjustableClock Clock { get; } = new();

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

            services.AddDbContext<AppDbContext>(options =>
            {
                options.UseInMemoryDatabase(_dbName);
                ConfigureDb(options);
            });

            // Today is pinned so the age and opening-date rules do not depend on the day the suite runs.
            services.RemoveAll<IBrazilDate>();
            services.AddSingleton<IBrazilDate>(new FixedBrazilDate(Today));

            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);

            services.RemoveAll<IGeocodingProvider>();
            services.AddScoped<IGeocodingProvider, FakeGeocodingProvider>();
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(MediaPath))
        {
            Directory.Delete(MediaPath, recursive: true);
        }
    }

    /// <summary>Lets a derived test host add EF interceptors (for example to make one kind of write fail).</summary>
    protected virtual void ConfigureDb(DbContextOptionsBuilder options)
    {
    }

    // Program.cs skips startup seeding in the Testing environment (the InMemory database has no migrations),
    // so run the same role/admin seeding the real startup performs. This app uses the minimal-hosting model,
    // so CreateHost (not CreateServer) is the override point that runs for WebApplication.CreateBuilder().
    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.ConfigureHostConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Seed:AdminEmail"] = AdminEmail,
            ["Seed:AdminPassword"] = AdminPassword,
            // The suites share one client address and sign in constantly; rate limiting has its own tests (RateLimitingTests).
            ["RateLimiting:Auth:PermitLimit"] = "100000",
            ["RateLimiting:Coverage:PermitLimit"] = "100000",
            ["RateLimiting:Contact:PermitLimit"] = "100000",
            ["RateLimiting:Addresses:PermitLimit"] = "100000",
            ["RateLimiting:Register:PermitLimit"] = "100000",
            ["RateLimiting:Profile:PermitLimit"] = "100000",
            ["RateLimiting:Reveal:PermitLimit"] = "100000",
            ["RateLimiting:ProductSetup:PermitLimit"] = "100000",
            ["RateLimiting:ProductPhoto:PermitLimit"] = "100000",
            ["Media:Path"] = MediaPath,
            // Throwaway Data Protection keys: the CPF encryption works, nothing is written outside the process.
            ["DataProtection:Ephemeral"] = "true"
        }));

        var host = base.CreateHost(builder);

        using var scope = host.Services.CreateScope();
        IdentityModule.SeedRolesAsync(scope.ServiceProvider).GetAwaiter().GetResult();
        IdentityModule.SeedAdminAsync(scope.ServiceProvider, host.Services.GetRequiredService<IConfiguration>()).GetAwaiter().GetResult();

        return host;
    }
}

/// <summary>The real time plus an offset a test can move forward (never back), so "an hour later" needs no waiting.</summary>
public sealed class AdjustableClock : TimeProvider
{
    private TimeSpan _offset = TimeSpan.Zero;

    public void Advance(TimeSpan by) => _offset += by;

    public override DateTimeOffset GetUtcNow() => base.GetUtcNow() + _offset;
}

/// <summary>A calendar that always says the same day.</summary>
public sealed class FixedBrazilDate(DateOnly today) : IBrazilDate
{
    public DateOnly Today => today;
}
