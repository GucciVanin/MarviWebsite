using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Inventory;

/// <summary>MRV-3.5: success and validation answers of PUT /api/admin/inventory.</summary>
public class AdminInventoryContractTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public AdminInventoryContractTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<Guid> CreateWarehouseAsync(HttpClient admin)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest($"CD {Guid.NewGuid():N}", "Rua A, 1", -23.5, -46.6));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WarehouseDto>())!.Id;
    }

    [Fact]
    public async Task Upsert_CreatesThenUpdatesTheRecord_AndReturnsIt()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreateProductAsync();
        var warehouse = await CreateWarehouseAsync(admin);

        var first = await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, warehouse, 40, 5));
        var second = await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, warehouse, 25, 8));

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var firstRecord = (await first.Content.ReadFromJsonAsync<InventoryRecordDto>())!;
        Assert.Equal(40, firstRecord.QtyOnHand);
        var secondRecord = (await second.Content.ReadFromJsonAsync<InventoryRecordDto>())!;
        Assert.Equal(firstRecord.Id, secondRecord.Id);
        Assert.Equal(25, secondRecord.QtyOnHand);
        Assert.Equal(8, secondRecord.ReorderPoint);
    }

    [Fact]
    public async Task Upsert_RejectsNegativeQuantities_UnknownProducts_AndUnknownWarehouses()
    {
        var admin = await _factory.AdminAsync();
        var product = await admin.CreateProductAsync();
        var warehouse = await CreateWarehouseAsync(admin);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, warehouse, -1, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, warehouse, 1, -1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(Guid.NewGuid(), warehouse, 1, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, Guid.NewGuid(), 1, 0))).StatusCode);
    }
}
