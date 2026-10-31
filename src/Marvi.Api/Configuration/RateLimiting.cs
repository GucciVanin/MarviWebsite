using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace Marvi.Api.Configuration;

/// <summary>
/// MRV-3.3b: per-client request limits on the endpoints anyone can hit without an account: sign-in and registration
/// (password guessing, account spam) and the public coverage check (each call may reach the paid geocoding provider).
/// Fixed windows per client address; going over answers 429 with <c>Retry-After</c>. The limits are configuration
/// (<c>RateLimiting:Auth</c>, <c>RateLimiting:Coverage</c> and, from MRV-2.8, <c>RateLimiting:Contact</c> for the public contact form, each with <c>PermitLimit</c> and <c>WindowSeconds</c>), so the
/// development stack and the test suites can run generously while production keeps the tight defaults.
/// </summary>
public static class RateLimiting
{
    public const string AuthPolicy = "auth";
    public const string CoveragePolicy = "coverage";
    public const string ContactPolicy = "contact";
    /// <summary>The write endpoints of a customer's addresses and the admin's address fix (MRV-9.3); <c>RateLimiting:Addresses</c>.</summary>
    public const string AddressesPolicy = "addresses";
    /// <summary>Creating an account (<c>POST /api/auth/register</c>), tighter than sign-in: it is also a CNPJ/CPF probe (MRV-9.4); <c>RateLimiting:Register</c>.</summary>
    public const string RegisterPolicy = "register";
    /// <summary>Saving the customer's own registration data (<c>PUT /api/client/profile</c>); a Pending customer can change the CPF/CNPJ freely, so this bounds duplicate probing (MRV-9.4); <c>RateLimiting:Profile</c>.</summary>
    public const string ProfilePolicy = "profile";
    /// <summary>The admin's "Mostrar CPF" (<c>POST .../cpf/reveal</c>), each one audited (MRV-9.4); <c>RateLimiting:Reveal</c>.</summary>
    public const string RevealPolicy = "reveal";

    /// <summary>The admin's guided product creation (<c>POST /api/admin/products/with-setup</c>): one request writes a product, its prices and its stock (MRV-9.5); <c>RateLimiting:ProductSetup</c>.</summary>
    public const string ProductSetupPolicy = "productSetup";

    private const int DefaultAuthPermits = 10;
    private const int DefaultCoveragePermits = 30;
    private const int DefaultContactPermits = 5;
    private const int DefaultAddressesPermits = 60;
    private const int DefaultRegisterPermits = 5;
    private const int DefaultProfilePermits = 20;
    private const int DefaultRevealPermits = 10;
    private const int DefaultProductSetupPermits = 30;
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
            AddPolicy(options, ContactPolicy, configuration.GetSection("RateLimiting:Contact"), DefaultContactPermits);
            AddPolicy(options, AddressesPolicy, configuration.GetSection("RateLimiting:Addresses"), DefaultAddressesPermits);
            AddPolicy(options, RegisterPolicy, configuration.GetSection("RateLimiting:Register"), DefaultRegisterPermits);
            AddPolicy(options, ProfilePolicy, configuration.GetSection("RateLimiting:Profile"), DefaultProfilePermits);
            AddPolicy(options, RevealPolicy, configuration.GetSection("RateLimiting:Reveal"), DefaultRevealPermits);
            AddPolicy(options, ProductSetupPolicy, configuration.GetSection("RateLimiting:ProductSetup"), DefaultProductSetupPermits);
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

        var options = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
            // One trusted hop (the bundled nginx) by default; with a load balancer in front of nginx that is two.
            ForwardLimit = Math.Max(1, app.Configuration.GetValue("ForwardedHeaders:ForwardLimit", 1)),
        };
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
        app.UseForwardedHeaders(options);
    }
}
