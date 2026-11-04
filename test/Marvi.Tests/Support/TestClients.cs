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

    /// <summary>
    /// Registers a fresh customer and has an admin approve them (with the default tier), so the tests of what a customer can do
    /// start from an approved customer. Returns a client signed in as them, with their account id. A new customer is Pending until
    /// approved: see <see cref="RegisterPendingClientAsync"/>.
    /// </summary>
    public static async Task<(HttpClient Client, Guid AccountId)> RegisterClientAsync(this MarviApiFactory factory)
    {
        var (client, id) = await factory.RegisterPendingClientAsync();
        var admin = await factory.AdminAsync();
        var tiers = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!;
        (await admin.PutAsJsonAsync($"/api/admin/clients/{id}/approve", new ApproveClientRequest(tiers.Single(t => t.IsDefault).Id))).EnsureSuccessStatusCode();
        return (client, id);
    }

    /// <summary>Registers a fresh customer, who stays Pending (the state registration leaves them in), signed in as them.</summary>
    public static async Task<(HttpClient Client, Guid AccountId)> RegisterPendingClientAsync(this MarviApiFactory factory)
    {
        var email = $"{Guid.NewGuid()}@example.com";
        var register = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", TestAddresses.Main));
        register.EnsureSuccessStatusCode();
        var id = (await register.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        return (await factory.LoginAsync(email, "Test1234!"), id);
    }

    /// <summary>Sets a client account status directly in the database (for states an endpoint cannot produce, such as a legacy account).</summary>
    public static async Task SetClientStatusAsync(this MarviApiFactory factory, Guid accountId, ClientAccountStatus status)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.ClientAccounts.FindAsync(accountId);
        account!.Status = status;
        await db.SaveChangesAsync();
        // The same thing an admin's decision does: the API forgets the status it had cached (MRV-9.9).
        scope.ServiceProvider.GetRequiredService<Marvi.Api.Features.Identity.ClientStatusCache>().Invalidate(accountId);
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
        var response = await admin.PostProductAsync(sku, name, categoryId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProductAdminDto>())!.Id;
    }

    /// <summary>
    /// The one way to create a product (MRV-9.8): <c>POST /api/admin/products/with-setup</c> with no prices and no stock. A product needs a
    /// category there, so without one the shared "Test products" category is used (see <see cref="EnsureTestCategoryAsync"/>).
    /// </summary>
    public static async Task<HttpResponseMessage> PostProductAsync(this HttpClient admin, string? sku = null, string name = "Widget", Guid? categoryId = null,
        bool isActive = true, string? description = null, string? imageUrl = null, Dictionary<string, string>? attributes = null) =>
        await admin.PostAsJsonAsync("/api/admin/products/with-setup",
            new CreateProductWithSetupRequest(sku ?? $"SKU-{Guid.NewGuid():N}", name, description, categoryId ?? await admin.EnsureTestCategoryAsync(), imageUrl,
                isActive, attributes ?? new Dictionary<string, string>(), [], []));

    /// <summary>The category that products made by <see cref="PostProductAsync"/> go in when a test does not care (created on first use).</summary>
    public static async Task<Guid> EnsureTestCategoryAsync(this HttpClient admin)
    {
        const string name = "Test products";
        async Task<Guid?> FindAsync() =>
            (await admin.GetFromJsonAsync<List<CategoryAdminDto>>("/api/admin/categories"))!.FirstOrDefault(c => c.Name == name)?.Id;

        if (await FindAsync() is { } existing)
        {
            return existing;
        }

        var response = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(name, 0, true));
        if (response.IsSuccessStatusCode)
        {
            return (await response.Content.ReadFromJsonAsync<CategoryAdminDto>())!.Id;
        }

        return await FindAsync() ?? throw new InvalidOperationException("Could not create the test category.");
    }
}
