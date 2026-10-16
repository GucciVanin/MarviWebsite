using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Admin.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Support;

/// <summary>MRV-6.2: everything that is waiting on an admin, in one place. Each test starts from an empty system so the counts are exact.</summary>
public class PendingActionsTests
{
    private static Task<PendingActionsDto> GetAsync(HttpClient admin) =>
        admin.GetFromJsonAsync<PendingActionsDto>("/api/admin/pending-actions")!;

    private static async Task<Guid> CreateWarehouseAsync(HttpClient admin, string name)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(name, "1 Main St", -23.5, -46.6));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WarehouseDto>())!.Id;
    }

    [Fact]
    public async Task AnEmptySystem_HasNothingWaiting()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();

        var pending = await GetAsync(admin);

        Assert.Equal(0, pending.Total);
        Assert.Equal(0, pending.Customers.Count);
        Assert.Empty(pending.UnstockedProducts.Items);
        Assert.Empty(pending.Customers.Items);
        Assert.Empty(pending.Quotes.Items);
        Assert.Empty(pending.LowStock.Items);
        Assert.Empty(pending.UnpricedProducts.Items);
    }

    [Fact]
    public async Task CustomersAwaitingApproval_AreListedOldestFirst_AndLeaveWhenDecided()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var (_, first) = await factory.RegisterPendingClientAsync();
        var (_, second) = await factory.RegisterPendingClientAsync();
        await factory.RegisterClientAsync(); // approved: not waiting
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.ClientAccounts.FindAsync(first))!.CreatedAt = DateTime.UtcNow.AddDays(-2);
            (await db.ClientAccounts.FindAsync(second))!.CreatedAt = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
        }

        var pending = await GetAsync(admin);

        Assert.Equal(2, pending.Customers.Count);
        Assert.Equal([first, second], pending.Customers.Items.Select(c => c.Id));
        Assert.Equal("Acme Co", pending.Customers.Items[0].CompanyName);

        var tiers = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!;
        (await admin.PutAsJsonAsync($"/api/admin/clients/{first}/approve", new ApproveClientRequest(tiers[0].Id))).EnsureSuccessStatusCode();
        (await admin.PutAsync($"/api/admin/clients/{second}/suspend", null)).EnsureSuccessStatusCode();

        Assert.Equal(0, (await GetAsync(admin)).Customers.Count);
    }

    [Fact]
    public async Task QuotesAwaitingAPrice_AreListedWithWhoAskedAndHowMany_AndLeaveOncePriced()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var (customer, _) = await factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var created = await customer.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 2), new QuoteLineItemRequest(product, 3)]));
        var quote = (await created.Content.ReadFromJsonAsync<QuoteDto>())!;

        var pending = await GetAsync(admin);

        var item = Assert.Single(pending.Quotes.Items);
        Assert.Equal(quote.Id, item.Id);
        Assert.Equal("Acme Co", item.CompanyName);
        Assert.Equal(2, item.LineCount);

        (await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price",
            new PriceQuoteRequest(quote.LineItems.Select(l => new PriceQuoteLineRequest(l.Id, 9m)).ToList()))).EnsureSuccessStatusCode();
        Assert.Equal(0, (await GetAsync(admin)).Quotes.Count);
    }

    [Fact]
    public async Task StockAtOrBelowItsReorderPoint_IsListed_AndOnlyForActiveProducts()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin, "CD Teste");
        var low = await admin.CreateProductAsync(name: "Quase acabando");
        var plenty = await admin.CreateProductAsync(name: "Muito estoque");
        var inactive = await admin.CreateProductAsync(name: "Inativo");
        foreach (var (product, onHand) in new[] { (low, 8), (plenty, 500), (inactive, 1) })
        {
            (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, warehouse, onHand, 20))).EnsureSuccessStatusCode();
        }

        var existing = (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{inactive}"))!;
        (await admin.PutAsJsonAsync($"/api/admin/products/{inactive}", new UpsertProductRequest(existing.Sku, existing.Name, null, null, null, false, new Dictionary<string, string>()))).EnsureSuccessStatusCode();

        var pending = await GetAsync(admin);

        var item = Assert.Single(pending.LowStock.Items);
        Assert.Equal(low, item.ProductId);
        Assert.Equal("Quase acabando", item.ProductName);
        Assert.Equal("CD Teste", item.WarehouseName);
        Assert.Equal(8, item.Available);
        Assert.Equal(20, item.ReorderPoint);
    }

    [Fact]
    public async Task ActiveProductsWithNoPriceInTheDefaultTier_AreListed_UntilTheyHaveOne()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        await factory.RegisterClientAsync(); // creates the default pricing tier
        var priced = await admin.CreatePricedProductAsync(10m);
        var unpriced = await admin.CreateProductAsync(name: "Sem preço");
        var otherTier = (await (await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest("Outra", false))).Content.ReadFromJsonAsync<PricingTierDto>())!;
        var onlyOtherTier = await admin.CreateProductAsync(name: "Só em outra faixa");
        (await admin.PutAsJsonAsync($"/api/admin/products/{onlyOtherTier}/pricing", new UpsertProductPricingRequest(otherTier.Id, 5m, 1))).EnsureSuccessStatusCode();

        var pending = await GetAsync(admin);

        Assert.Equal(2, pending.UnpricedProducts.Count);
        Assert.DoesNotContain(pending.UnpricedProducts.Items, p => p.ProductId == priced);
        Assert.Contains(pending.UnpricedProducts.Items, p => p.ProductId == unpriced && p.Name == "Sem preço");

        var defaultTier = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!.Single(t => t.IsDefault);
        (await admin.PutAsJsonAsync($"/api/admin/products/{unpriced}/pricing", new UpsertProductPricingRequest(defaultTier.Id, 3m, 1))).EnsureSuccessStatusCode();
        Assert.Equal(1, (await GetAsync(admin)).UnpricedProducts.Count);
    }

    [Fact]
    public async Task AProductPricedOnlyForBigQuantities_StillShowsSobConsultaToVisitors_SoItIsListedAsUnpriced()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        await factory.RegisterClientAsync(); // creates the default pricing tier
        var defaultTier = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers"))!.Single(t => t.IsDefault);
        var product = await admin.CreateProductAsync(name: "Só por atacado");
        (await admin.PutAsJsonAsync($"/api/admin/products/{product}/pricing", new UpsertProductPricingRequest(defaultTier.Id, 3m, 10))).EnsureSuccessStatusCode();

        var visitorPrice = (await factory.CreateClient().GetFromJsonAsync<List<ProductListItemDto>>("/api/products"))!.Single(p => p.Id == product).Price;
        var pending = await GetAsync(admin);

        Assert.Null(visitorPrice);
        Assert.Contains(pending.UnpricedProducts.Items, p => p.ProductId == product);
    }

    [Fact]
    public async Task ActiveProductsWithNoStockRecordAtAll_AreListed_UntilTheyAreStocked()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var warehouse = await CreateWarehouseAsync(admin, "CD Teste");
        var unstocked = await admin.CreateProductAsync(name: "Nunca recebeu estoque");
        var stocked = await admin.CreateProductAsync(name: "Com estoque");
        (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(stocked, warehouse, 100, 10))).EnsureSuccessStatusCode();

        var pending = await GetAsync(admin);

        var item = Assert.Single(pending.UnstockedProducts.Items);
        Assert.Equal(unstocked, item.ProductId);
        Assert.Equal(1, pending.UnstockedProducts.Count);

        (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(unstocked, warehouse, 0, 10))).EnsureSuccessStatusCode();
        var afterRecord = await GetAsync(admin);
        Assert.Equal(0, afterRecord.UnstockedProducts.Count);
        Assert.Contains(afterRecord.LowStock.Items, i => i.ProductId == unstocked); // a record at zero is low stock instead
    }

    [Fact]
    public async Task TheTotalAddsEveryGroup_AndEachGroupListsAtMostFiftyButCountsAll()
    {
        await using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            for (var i = 0; i < 55; i++)
            {
                db.ClientAccounts.Add(new ClientAccount
                {
                    Id = Guid.NewGuid(), UserId = Guid.NewGuid(), CompanyName = $"Espera {i:D2}", BillingAddress = "x",
                    CreatedAt = DateTime.UtcNow.AddMinutes(-i), Status = ClientAccountStatus.Pending,
                });
            }

            await db.SaveChangesAsync();
        }
        await admin.CreateProductAsync(name: "Sem preço"); // one more thing waiting, in another group

        var pending = await GetAsync(admin);

        Assert.Equal(55, pending.Customers.Count);
        Assert.Equal(50, pending.Customers.Items.Count);
        Assert.Equal("Espera 54", pending.Customers.Items[0].CompanyName); // the one waiting longest
        // The product has neither a price nor a stock record: it waits in two groups.
        Assert.Equal(55 + 2, pending.Total);
    }

    [Fact]
    public async Task IsForAdminsOnly()
    {
        await using var factory = new MarviApiFactory();
        var (customer, _) = await factory.RegisterClientAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync("/api/admin/pending-actions")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/admin/pending-actions")).StatusCode);
    }
}
