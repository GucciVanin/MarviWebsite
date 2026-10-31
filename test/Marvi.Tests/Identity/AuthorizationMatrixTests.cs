using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

/// <summary>
/// MRV-3.5: the role gate of every protected endpoint, in one place. A visitor is refused with 401, a signed-in user of a
/// role the endpoint does not allow with 403, and the allowed roles get past the gate (any other status, usually a 400/404
/// because the ids are made up). Authorization runs before model binding, so an empty JSON body is enough.
/// </summary>
public class AuthorizationMatrixTests : IClassFixture<MarviApiFactory>
{
    private const string Admin = "Admin";
    private const string Employee = "Employee";
    private const string Client = "Client";

    private static readonly string[] AdminOnly = [Admin];
    private static readonly string[] Staff = [Employee, Admin];
    private static readonly string[] ClientOnly = [Client];

    private static readonly Guid Id = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private readonly MarviApiFactory _factory;

    public AuthorizationMatrixTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    public static IEnumerable<(HttpMethod Method, string Url, string[] Roles)> Endpoints()
    {
        // Admin
        yield return (HttpMethod.Get, "/api/admin/pending-actions", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/audit-log", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/categories", AdminOnly);
        yield return (HttpMethod.Get, $"/api/admin/categories/{Id}", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/categories", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/categories/{Id}", AdminOnly);
        yield return (HttpMethod.Delete, $"/api/admin/categories/{Id}", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/deals", AdminOnly);
        yield return (HttpMethod.Get, $"/api/admin/deals/{Id}", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/deals", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/deals/{Id}", AdminOnly);
        yield return (HttpMethod.Delete, $"/api/admin/deals/{Id}", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/pricing-tiers", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/pricing-tiers", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/pricing-tiers/{Id}", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/products", AdminOnly);
        yield return (HttpMethod.Get, $"/api/admin/products/{Id}", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/products", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/products/{Id}", AdminOnly);
        yield return (HttpMethod.Delete, $"/api/admin/products/{Id}", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/products/import", AdminOnly);
        yield return (HttpMethod.Get, $"/api/admin/products/{Id}/pricing", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/products/{Id}/pricing", AdminOnly);
        yield return (HttpMethod.Delete, $"/api/admin/products/{Id}/pricing/{OtherId}/1", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/warehouses", AdminOnly);
        yield return (HttpMethod.Get, $"/api/admin/warehouses/{Id}", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/warehouses", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/warehouses/{Id}", AdminOnly);
        yield return (HttpMethod.Delete, $"/api/admin/warehouses/{Id}", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/coverage-areas", AdminOnly);
        yield return (HttpMethod.Get, $"/api/admin/coverage-areas/{Id}", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/coverage-areas", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/coverage-areas/{Id}", AdminOnly);
        yield return (HttpMethod.Delete, $"/api/admin/coverage-areas/{Id}", AdminOnly);
        yield return (HttpMethod.Put, "/api/admin/inventory", AdminOnly);
        yield return (HttpMethod.Post, "/api/admin/employees", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/clients/{Id}/approve", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/clients/{Id}/registration", AdminOnly);
        yield return (HttpMethod.Post, $"/api/admin/clients/{Id}/cpf/reveal", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/clients/{Id}/suspend", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/clients/{Id}/pricing-tier", AdminOnly);
        yield return (HttpMethod.Put, $"/api/admin/clients/{Id}/addresses/{OtherId}", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/customers/by-number/42", AdminOnly);
        yield return (HttpMethod.Get, "/api/admin/contact-messages", AdminOnly);
        yield return (HttpMethod.Post, $"/api/admin/contact-messages/{Id}/handle", AdminOnly);

        // Employee and Admin
        yield return (HttpMethod.Get, "/api/employee/clients", Staff);
        yield return (HttpMethod.Get, $"/api/employee/clients/{Id}", Staff);
        yield return (HttpMethod.Get, "/api/employee/clients/by-number/42", Staff);
        yield return (HttpMethod.Get, "/api/employee/inventory", Staff);
        yield return (HttpMethod.Post, "/api/employee/orders", Staff);
        yield return (HttpMethod.Get, "/api/employee/orders/history", Staff);
        yield return (HttpMethod.Get, "/api/employee/quotes/queue", Staff);
        yield return (HttpMethod.Get, "/api/employee/quotes/history", Staff);
        yield return (HttpMethod.Put, $"/api/employee/quotes/{Id}/price", Staff);

        // Client
        yield return (HttpMethod.Get, "/api/client/profile", ClientOnly);
        yield return (HttpMethod.Put, "/api/client/profile", ClientOnly);
        yield return (HttpMethod.Post, "/api/client/addresses", ClientOnly);
        yield return (HttpMethod.Put, $"/api/client/addresses/{Id}", ClientOnly);
        yield return (HttpMethod.Delete, $"/api/client/addresses/{Id}", ClientOnly);
        yield return (HttpMethod.Get, "/api/orders/mine", ClientOnly);
        yield return (HttpMethod.Post, "/api/quotes", ClientOnly);
        yield return (HttpMethod.Get, "/api/quotes/mine", ClientOnly);
        yield return (HttpMethod.Post, $"/api/quotes/{Id}/accept", ClientOnly);
        yield return (HttpMethod.Post, $"/api/quotes/{Id}/reject", ClientOnly);
    }

    private static HttpRequestMessage Request(HttpMethod method, string url) => new(method, url)
    {
        Content = method == HttpMethod.Get || method == HttpMethod.Delete ? null
            : url.EndsWith("/products/import", StringComparison.Ordinal) ? new MultipartFormDataContent() // the import only accepts multipart
            : new StringContent("{}", Encoding.UTF8, "application/json")
    };

    [Fact]
    public async Task EveryProtectedEndpoint_RefusesVisitors_AndRolesItDoesNotAllow_ButAdmitsTheOnesItDoes()
    {
        var admin = await _factory.AdminAsync();
        var email = $"{Guid.NewGuid()}@example.com";
        (await admin.PostAsJsonAsync("/api/admin/employees",
            new CreateEmployeeRequest(email, "Test1234!", $"E-{Guid.NewGuid():N}"[..20], "Sales", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)))).EnsureSuccessStatusCode();
        var employee = await _factory.LoginAsync(email, "Test1234!");
        var (client, _) = await _factory.RegisterClientAsync();
        var visitor = _factory.CreateClient();

        var byRole = new Dictionary<string, HttpClient> { [Admin] = admin, [Employee] = employee, [Client] = client };
        var problems = new List<string>();

        foreach (var (method, url, allowed) in Endpoints())
        {
            var anonymous = await visitor.SendAsync(Request(method, url));
            if (anonymous.StatusCode != HttpStatusCode.Unauthorized)
            {
                problems.Add($"{method} {url} as visitor: expected 401, got {(int)anonymous.StatusCode}");
            }

            foreach (var (role, http) in byRole)
            {
                var status = (await http.SendAsync(Request(method, url))).StatusCode;
                if (allowed.Contains(role))
                {
                    if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                    {
                        problems.Add($"{method} {url} as {role}: allowed role was refused with {(int)status}");
                    }
                    else if ((int)status >= 500)
                    {
                        problems.Add($"{method} {url} as {role}: allowed role got a server error {(int)status}");
                    }
                }
                else if (status != HttpStatusCode.Forbidden)
                {
                    problems.Add($"{method} {url} as {role}: expected 403, got {(int)status}");
                }
            }
        }

        Assert.True(problems.Count == 0, string.Join(Environment.NewLine, problems));
    }

    private static Regex RouteRegex(string pattern)
    {
        var text = Regex.Replace(pattern.Trim('/'), @"\{[^}]+\}", m =>
            m.Value.Contains(":guid") ? "[0-9a-fA-F-]{36}" : m.Value.Contains(":int") ? @"-?\d+" : "[^/]+");
        return new Regex("^" + text + "$", RegexOptions.IgnoreCase);
    }

    /// <summary>Drift guard: every endpoint that requires authorization has a matrix row, and every matrix row is a real endpoint.</summary>
    [Fact]
    public void TheMatrix_ListsExactlyTheProtectedEndpointsTheAppExposes()
    {
        var real = _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Select(e => (Endpoint: e, Methods: e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? []))
            .ToList();
        var matrix = Endpoints().ToList();
        var problems = new List<string>();

        foreach (var (endpoint, methods) in real)
        {
            var route = "/" + endpoint.RoutePattern.RawText!.Trim('/');
            var protectedEndpoint = endpoint.Metadata.GetMetadata<IAuthorizeData>() is not null
                && endpoint.Metadata.GetMetadata<IAllowAnonymous>() is null
                && !route.Equals("/health", StringComparison.OrdinalIgnoreCase);
            if (!protectedEndpoint)
            {
                continue;
            }

            var regex = RouteRegex(route);
            foreach (var method in methods)
            {
                if (!matrix.Any(m => m.Method.Method.Equals(method, StringComparison.OrdinalIgnoreCase) && regex.IsMatch(m.Url.TrimStart('/'))))
                {
                    problems.Add($"Protected endpoint {method} {route} has no row in AuthorizationMatrixTests.Endpoints()");
                }
            }
        }

        foreach (var (method, url, _) in matrix)
        {
            var path = url.TrimStart('/');
            var exists = real.Any(r => r.Methods.Contains(method.Method, StringComparer.OrdinalIgnoreCase)
                && RouteRegex(r.Endpoint.RoutePattern.RawText!).IsMatch(path));
            if (!exists)
            {
                problems.Add($"Matrix row {method} {url} matches no endpoint of the app");
            }
        }

        Assert.True(problems.Count == 0, string.Join(Environment.NewLine, problems));
    }

    [Theory]
    [InlineData("/api/products")]
    [InlineData("/api/deals")]
    [InlineData("/api/categories")]
    [InlineData("/api/public/stats")]
    [InlineData("/api/public/reviews")]
    [InlineData("/health")]
    public async Task PublicEndpoints_AnswerVisitors(string url)
    {
        var response = await _factory.CreateClient().GetAsync(url);

        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.True((int)response.StatusCode < 500, $"{url} answered {(int)response.StatusCode}");
    }
}
