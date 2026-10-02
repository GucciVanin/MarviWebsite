using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Catalog;

public class ProductsControllerTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;
    private readonly HttpClient _client;

    public ProductsControllerTests(MarviApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetProducts_ReturnsDefaultTierPriceAnonymous_AndClientTierPriceWhenAuthenticated()
    {
        var productId = Guid.NewGuid();
        var defaultTierId = Guid.NewGuid();
        var wholesaleTierId = Guid.NewGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            db.PricingTiers.Add(new PricingTier { Id = defaultTierId, Name = "Default", IsDefault = true });
            db.PricingTiers.Add(new PricingTier { Id = wholesaleTierId, Name = "Wholesale" });
            db.Products.Add(new Product { Id = productId, Sku = "SKU-1", Name = "Widget", IsActive = true });
            db.ProductPricings.Add(new ProductPricing { Id = Guid.NewGuid(), ProductId = productId, PricingTierId = defaultTierId, MinQty = 1, UnitPrice = 100m });
            db.ProductPricings.Add(new ProductPricing { Id = Guid.NewGuid(), ProductId = productId, PricingTierId = wholesaleTierId, MinQty = 1, UnitPrice = 80m });

            await db.SaveChangesAsync();
        }

        // Anonymous requests are priced with the default tier.
        var anonymousResponse = await _client.GetFromJsonAsync<List<ProductListItemDto>>("/api/products");
        Assert.NotNull(anonymousResponse);
        var anonymousProduct = Assert.Single(anonymousResponse!, p => p.Id == productId);
        Assert.Equal(100m, anonymousProduct.Price);

        var email = $"{Guid.NewGuid()}@example.com";
        var registerResponse = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", "123 Main St"));
        var registerBody = await registerResponse.Content.ReadAsStringAsync();
        var clientAccountId = JsonDocument.Parse(registerBody).RootElement.GetProperty("id").GetGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var clientAccount = await db.ClientAccounts.SingleAsync(c => c.Id == clientAccountId);
            clientAccount.PricingTierId = wholesaleTierId;
            await db.SaveChangesAsync();
        }

        var loginResponse = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "Test1234!"));
        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();

        using var authedRequest = new HttpRequestMessage(HttpMethod.Get, "/api/products");
        authedRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        var authedHttpResponse = await _client.SendAsync(authedRequest);
        var authedProducts = await authedHttpResponse.Content.ReadFromJsonAsync<List<ProductListItemDto>>();

        var tieredProduct = Assert.Single(authedProducts!, p => p.Id == productId);
        Assert.Equal(80m, tieredProduct.Price);
    }
}
