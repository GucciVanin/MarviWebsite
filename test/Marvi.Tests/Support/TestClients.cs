using System.Net.Http.Headers;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Support;

/// <summary>Signed-in HTTP clients and common seed calls for integration tests.</summary>
public static class TestClients
{
    public static async Task<HttpClient> LoginAsync(this MarviApiFactory factory, string email, string password)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return client;
    }

    public static Task<HttpClient> AdminAsync(this MarviApiFactory factory) =>
        factory.LoginAsync(MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword);

    /// <summary>Registers a fresh client account and returns a client signed in as it, with its account id.</summary>
    public static async Task<(HttpClient Client, Guid AccountId)> RegisterClientAsync(this MarviApiFactory factory)
    {
        var email = $"{Guid.NewGuid()}@example.com";
        var register = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", "123 Main St"));
        register.EnsureSuccessStatusCode();
        var id = (await register.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        return (await factory.LoginAsync(email, "Test1234!"), id);
    }

    /// <summary>Sets a client account status directly (there is no endpoint that produces Pending).</summary>
    public static async Task SetClientStatusAsync(this MarviApiFactory factory, Guid accountId, ClientAccountStatus status)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.ClientAccounts.FindAsync(accountId);
        account!.Status = status;
        await db.SaveChangesAsync();
    }

    /// <summary>Creates a product priced for the default tier (the tier new clients are assigned).</summary>
    public static async Task<Guid> CreatePricedProductAsync(this HttpClient admin, decimal unitPrice)
    {
        var productId = await admin.CreateProductAsync();
        var tiers = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!;
        var defaultTier = Assert.Single(tiers, t => t.IsDefault);
        (await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing", new UpsertProductPricingRequest(defaultTier.Id, unitPrice, 1))).EnsureSuccessStatusCode();
        return productId;
    }

    public static async Task<Guid> CreateProductAsync(this HttpClient admin, string? sku = null, string name = "Widget", Guid? categoryId = null)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/products",
            new UpsertProductRequest(sku ?? $"SKU-{Guid.NewGuid():N}", name, null, categoryId, null, true, new Dictionary<string, string>()));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProductAdminDto>())!.Id;
    }
}
