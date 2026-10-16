using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace Marvi.Api.Configuration;

/// <summary>
/// MRV-3.3b: per-client request limits on the endpoints anyone can hit without an account: sign-in and registration
/// (password guessing, account spam) and the public coverage check (each call may reach the paid geocoding provider).
/// Fixed windows per client address; going over answers 429 with <c>Retry-After</c>. The limits are configuration
/// (<c>RateLimiting:Auth</c> and <c>RateLimiting:Coverage</c>, each with <c>PermitLimit</c> and <c>WindowSeconds</c>), so the
/// development stack and the test suites can run generously while production keeps the tight defaults.
/// </summary>
public static class RateLimiting
{
    public const string AuthPolicy = "auth";
    public const string CoveragePolicy = "coverage";

    private const int DefaultAuthPermits = 10;
    private const int DefaultCoveragePermits = 30;
    private const int DefaultWindowSeconds = 60;

    public static IServiceCollection AddMarviRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (context, _) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                }

                return ValueTask.CompletedTask;
            };

            AddPolicy(options, AuthPolicy, configuration.GetSection("RateLimiting:Auth"), DefaultAuthPermits);
            AddPolicy(options, CoveragePolicy, configuration.GetSection("RateLimiting:Coverage"), DefaultCoveragePermits);
        });

        return services;
    }

    private static void AddPolicy(RateLimiterOptions options, string name, IConfigurationSection section, int defaultPermits)
    {
        var permits = Math.Max(1, section.GetValue("PermitLimit", defaultPermits));
        var window = TimeSpan.FromSeconds(Math.Max(1, section.GetValue("WindowSeconds", DefaultWindowSeconds)));

        options.AddPolicy(name, httpContext => RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permits,
                Window = window,
                QueueLimit = 0,
            }));
    }

    /// <summary>
    /// Behind the nginx proxy every request arrives from the proxy's address, so the real client comes from X-Forwarded-For.
    /// Only enabled when the deployment says so (<c>ForwardedHeaders:Enabled</c>): trusting the header on an API that is reachable
    /// directly would let a caller pick their own address and sidestep the limits.
    /// </summary>
    public static void UseForwardedClientAddress(this WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("ForwardedHeaders:Enabled"))
        {
            return;
        }

        var options = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto };
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
        app.UseForwardedHeaders(options);
    }
}
