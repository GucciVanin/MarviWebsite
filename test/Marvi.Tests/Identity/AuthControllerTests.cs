using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Identity;

public class AuthControllerTests : IClassFixture<MarviApiFactory>
{
    private readonly HttpClient _client;

    public AuthControllerTests(MarviApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task RegisterThenLogin_ReturnsUsableJwt()
    {
        var email = $"{Guid.NewGuid()}@example.com";
        var registerRequest = new RegisterRequest(email, "Test1234!", "Acme Co", "123 Main St");

        var registerResponse = await _client.PostAsJsonAsync("/api/auth/register", registerRequest);
        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);

        var loginRequest = new LoginRequest(email, "Test1234!");
        var loginResponse = await _client.PostAsJsonAsync("/api/auth/login", loginRequest);
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.False(string.IsNullOrWhiteSpace(auth!.Token));
        Assert.True(auth.ExpiresAt > DateTime.UtcNow);

        // The token must actually be accepted as a bearer credential by the API.
        using var authedRequest = new HttpRequestMessage(HttpMethod.Get, "/api/products");
        authedRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        var authedResponse = await _client.SendAsync(authedRequest);
        Assert.Equal(HttpStatusCode.OK, authedResponse.StatusCode);
    }
}
