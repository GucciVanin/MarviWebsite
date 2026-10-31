using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;

namespace Marvi.Tests.Support;

/// <summary>MRV-3.3b: sign-in, registration and the public coverage check are limited per client address and answer 429 with Retry-After.</summary>
public class RateLimitingTests : IClassFixture<RateLimitingTests.TightLimitsFactory>
{
    private readonly TightLimitsFactory _factory;

    public RateLimitingTests(TightLimitsFactory factory) => _factory = factory;

    [Fact]
    public async Task Login_IsLimitedPerClient_With429AndRetryAfter()
    {
        using var client = _factory.CreateClient();
        var attempt = new { email = "nobody@marvi.test", password = "Wrong-Password-1!" };

        for (var i = 0; i < 3; i++)
        {
            var allowed = await client.PostAsJsonAsync("/api/auth/login", attempt);
            Assert.Equal(HttpStatusCode.Unauthorized, allowed.StatusCode);
        }

        var limited = await client.PostAsJsonAsync("/api/auth/login", attempt);

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    [Fact]
    public async Task TheCoverageCheck_IsLimited_ButOtherEndpointsAreNot()
    {
        using var client = _factory.CreateClient();
        var request = new { address = "Rua Qualquer 1, Sao Paulo" };

        HttpStatusCode last = default;
        for (var i = 0; i < 4; i++)
        {
            last = (await client.PostAsJsonAsync("/api/coverage/check", request)).StatusCode;
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task TheAddressWrites_AreLimited_WithRetryAfter_ButReadingTheProfileIsNot()
    {
        using var factory = new TightLimitsFactory(); // its own factory: the auth budget of the shared one is spent by the tests above
        var (customer, _) = await factory.RegisterPendingClientAsync();

        for (var i = 1; i <= 3; i++)
        {
            Assert.Equal(HttpStatusCode.Created, (await customer.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other(i.ToString()))).StatusCode);
        }

        var limited = await customer.PostAsJsonAsync("/api/client/addresses", TestAddresses.Other("4"));
        var deleteLimited = await customer.DeleteAsync($"/api/client/addresses/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
        Assert.Equal(HttpStatusCode.TooManyRequests, deleteLimited.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await customer.GetAsync("/api/client/profile")).StatusCode);
    }

    [Fact]
    public async Task TheAdminAddressFix_IsLimitedToo_With429AndRetryAfter()
    {
        using var factory = new TightLimitsFactory();
        var (customer, id) = await factory.RegisterPendingClientAsync();
        var admin = await factory.AdminAsync();
        var key = (await customer.GetFromJsonAsync<Marvi.Api.Features.Identity.Contracts.ClientOwnProfileDto>("/api/client/profile"))!.Addresses.Single().Key;

        for (var i = 1; i <= 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/addresses/{key}", TestAddresses.Main with { Label = $"Sede {i}", Kind = Marvi.Domain.Identity.ClientAddressKind.Both })).StatusCode);
        }

        var limited = await admin.PutAsJsonAsync($"/api/admin/clients/{id}/addresses/{key}", TestAddresses.Main with { Label = "Sede 4", Kind = Marvi.Domain.Identity.ClientAddressKind.Both });

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    [Fact]
    public async Task TheDeliveryAddressChangeOfAQuote_IsLimited_With429AndRetryAfter()
    {
        using var factory = new TightLimitsFactory();
        var (customer, _) = await factory.RegisterPendingClientAsync();
        var body = new Marvi.Api.Features.Common.ChangeDeliveryAddressRequest(Guid.NewGuid());

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.NotFound, (await customer.PutAsJsonAsync("/api/quotes/1/delivery-address", body)).StatusCode);
        }

        var limited = await customer.PutAsJsonAsync("/api/quotes/1/delivery-address", body);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    [Fact]
    public async Task TheDeliveryAddressAmendOfAnOrder_IsLimited_With429AndRetryAfter()
    {
        using var factory = new TightLimitsFactory();
        var admin = await factory.AdminAsync();
        var body = new Marvi.Api.Features.Common.ChangeDeliveryAddressRequest(Guid.NewGuid());

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync("/api/employee/orders/1/delivery-address", body)).StatusCode);
        }

        var limited = await admin.PutAsJsonAsync("/api/employee/orders/1/delivery-address", body);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    /// <summary>Three requests per minute on each limited endpoint group.</summary>
    public sealed class TightLimitsFactory : MarviApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimiting:Auth:PermitLimit"] = "3",
                ["RateLimiting:Coverage:PermitLimit"] = "3",
                ["RateLimiting:Addresses:PermitLimit"] = "3",
            }));
        }
    }
}
