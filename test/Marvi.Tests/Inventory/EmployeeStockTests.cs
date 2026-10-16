using System.Net.Http.Json;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Inventory;

/// <summary>MRV-2.4b.3: the stock list says which warehouse a record is in by name, not only by id.</summary>
public class EmployeeStockTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public EmployeeStockTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task TheEmployeeStockList_CarriesTheWarehouseName_AndSoDoesTheAdminsStockChange()
    {
        var admin = await _factory.AdminAsync();
        var name = $"CD {Guid.NewGuid():N}"[..12];
        var warehouse = (await (await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(name, "1 Main St", -23.5, -46.6)))
            .Content.ReadFromJsonAsync<WarehouseDto>())!;
        var product = await admin.CreateProductAsync();

        var changed = await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(product, warehouse.Id, 30, 5));
        changed.EnsureSuccessStatusCode();
        var listed = (await admin.GetFromJsonAsync<List<InventoryRecordDto>>($"/api/employee/inventory?warehouseId={warehouse.Id}"))!;

        Assert.Equal(name, (await changed.Content.ReadFromJsonAsync<InventoryRecordDto>())!.WarehouseName);
        var record = Assert.Single(listed);
        Assert.Equal(name, record.WarehouseName);
        Assert.Equal(warehouse.Id, record.WarehouseId);
        Assert.Equal(30, record.QtyOnHand);
    }
}
