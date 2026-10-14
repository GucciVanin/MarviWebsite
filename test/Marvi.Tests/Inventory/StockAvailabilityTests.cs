using System.Net.Http.Json;
using System.Text.Json;
using Marvi.Domain.Coverage;
using Marvi.Domain.Inventory;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Inventory;

/// <summary>
/// Stock availability (MRV-4.10): a product is in stock when what is on hand minus what is reserved, summed over every
/// warehouse, is above zero. Pinned through the public catalog (list and detail), which is where visitors see it.
/// </summary>
public class StockAvailabilityTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public StockAvailabilityTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private async Task<Guid> ProductWithStockAsync(params (int OnHand, int Reserved)[] perWarehouse)
    {
        await _factory.RegisterClientAsync(); // the catalog needs a default pricing tier, which the first registration creates
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var (onHand, reserved) in perWarehouse)
        {
            var warehouse = new Warehouse { Id = Guid.NewGuid(), Name = $"WH {Guid.NewGuid():N}", Address = "x" };
            db.Warehouses.Add(warehouse);
            db.InventoryRecords.Add(new InventoryRecord
            {
                Id = Guid.NewGuid(), ProductId = productId, WarehouseId = warehouse.Id, QtyOnHand = onHand, QtyReserved = reserved, ReorderPoint = 1
            });
        }

        await db.SaveChangesAsync();
        return productId;
    }

    private async Task<bool> InStockInListAsync(Guid productId)
    {
        var items = (await _factory.CreateClient().GetFromJsonAsync<List<JsonElement>>("/api/products"))!;
        return items.Single(i => i.GetProperty("id").GetGuid() == productId).GetProperty("inStock").GetBoolean();
    }

    private async Task<bool> InStockInDetailAsync(Guid productId) =>
        (await _factory.CreateClient().GetFromJsonAsync<JsonElement>($"/api/products/{productId}")).GetProperty("inStock").GetBoolean();

    [Theory]
    [InlineData(false, new int[0], new int[0])]                 // no stock record at all
    [InlineData(false, new[] { 0 }, new[] { 0 })]               // nothing on hand
    [InlineData(false, new[] { 5 }, new[] { 5 })]               // everything reserved
    [InlineData(true, new[] { 5 }, new[] { 4 })]                // one unit free
    [InlineData(true, new[] { 2, 3 }, new[] { 2, 0 })]          // free stock in a second warehouse counts
    [InlineData(false, new[] { 1, 2 }, new[] { 3, 0 })]         // an over-reserved warehouse (-2) offsets the other (+2): the sum is 0
    [InlineData(true, new[] { 10, 1 }, new[] { 3, 3 })]         // the sum over warehouses, not any single warehouse
    public async Task InStock_IsOnHandMinusReserved_SummedAcrossWarehouses(bool expected, int[] onHand, int[] reserved)
    {
        var records = onHand.Zip(reserved, (o, r) => (o, r)).ToArray();
        var productId = await ProductWithStockAsync(records);

        Assert.Equal(expected, await InStockInListAsync(productId));
        Assert.Equal(expected, await InStockInDetailAsync(productId));
    }

    [Fact]
    public async Task EveryProductInTheList_GetsItsOwnFlag_FromItsOwnStockOnly()
    {
        var inStock = await ProductWithStockAsync((4, 1));
        var soldOut = await ProductWithStockAsync((4, 4));
        var noStock = await ProductWithStockAsync();

        Assert.True(await InStockInListAsync(inStock));
        Assert.False(await InStockInListAsync(soldOut));
        Assert.False(await InStockInListAsync(noStock));
    }
}
