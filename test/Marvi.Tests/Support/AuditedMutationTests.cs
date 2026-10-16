using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Coverage;
using Marvi.Tests.Support;

namespace Marvi.Tests.Support;

/// <summary>
/// Every admin change is recorded in the audit log, atomically with the change (MRV-4.4): one assertion per admin
/// mutation endpoint, then a failure-path test that the change is not stored when its audit entry cannot be.
/// </summary>
public class AuditedMutationTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public AuditedMutationTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task AssertAuditedAsync(HttpClient admin, string entityName, string action, Guid entityId)
    {
        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = Assert.Single(entries, e => e.EntityName == entityName && e.Action == action && e.EntityId == entityId);
        Assert.NotEqual(Guid.Empty, entry.ActorUserId);
    }

    private static async Task AssertAuditedByDetailsAsync(HttpClient admin, string entityName, string action, string detailsContain)
    {
        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = Assert.Single(entries, e => e.EntityName == entityName && e.Action == action && e.Details.GetValueOrDefault("data", "").Contains(detailsContain));
        Assert.NotEqual(Guid.Empty, entry.ActorUserId);
    }

    private static async Task<T> OkAsync<T>(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}";

    [Fact]
    public async Task Products_AreAudited_OnCreateUpdateAndDelete()
    {
        var admin = await _factory.AdminAsync();
        var created = await admin.PostAsJsonAsync("/api/admin/products", new UpsertProductRequest(Unique("SKU"), "Widget", null, null, null, true, new()));
        var id = (await OkAsync<ProductAdminDto>(created)).Id;
        await AssertAuditedAsync(admin, "Product", "Create", id);

        (await admin.PutAsJsonAsync($"/api/admin/products/{id}", new UpsertProductRequest(Unique("SKU"), "Widget 2", null, null, null, true, new()))).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Product", "Update", id);

        (await admin.DeleteAsync($"/api/admin/products/{id}")).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Product", "Delete", id);
    }

    [Fact]
    public async Task Categories_AreAudited_OnCreateUpdateAndDelete()
    {
        var admin = await _factory.AdminAsync();
        var id = (await OkAsync<CategoryAdminDto>(await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(Unique("Cat"), 1, true)))).Id;
        await AssertAuditedAsync(admin, "Category", "Create", id);

        (await admin.PutAsJsonAsync($"/api/admin/categories/{id}", new UpsertCategoryRequest(Unique("Cat"), 2, true))).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Category", "Update", id);

        (await admin.DeleteAsync($"/api/admin/categories/{id}")).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Category", "Delete", id);
    }

    [Fact]
    public async Task Deals_AreAudited_OnCreateUpdateAndDelete()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var now = DateTime.UtcNow;
        var request = new UpsertDealRequest(Unique("Deal"), DiscountType.Percent, 10m, now.AddDays(-1), now.AddDays(1), [productId], [], 1);
        var id = (await OkAsync<DealAdminDto>(await admin.PostAsJsonAsync("/api/admin/deals", request))).Id;
        await AssertAuditedAsync(admin, "Deal", "Create", id);

        (await admin.PutAsJsonAsync($"/api/admin/deals/{id}", request with { DiscountValue = 20m })).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Deal", "Update", id);

        (await admin.DeleteAsync($"/api/admin/deals/{id}")).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Deal", "Delete", id);
    }

    [Fact]
    public async Task PricingTiers_AreAudited_OnCreateAndUpdate()
    {
        var admin = await _factory.AdminAsync();
        var id = (await OkAsync<PricingTierDto>(await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(Unique("Tier"), false)))).Id;
        await AssertAuditedAsync(admin, "PricingTier", "Create", id);

        (await admin.PutAsJsonAsync($"/api/admin/pricing-tiers/{id}", new UpsertPricingTierRequest(Unique("Tier"), false))).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "PricingTier", "Update", id);
    }

    [Fact]
    public async Task ProductPrices_AreAudited_OnUpsertAndDelete()
    {
        var admin = await _factory.AdminAsync();
        var productId = await admin.CreateProductAsync();
        var tierId = (await OkAsync<PricingTierDto>(await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(Unique("Tier"), false)))).Id;

        var put = await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing", new UpsertProductPricingRequest(tierId, 5m, 1));
        put.EnsureSuccessStatusCode();
        await AssertAuditedByDetailsAsync(admin, "ProductPricing", "Upsert", productId.ToString());

        (await admin.DeleteAsync($"/api/admin/products/{productId}/pricing/{tierId}/1")).EnsureSuccessStatusCode();
        await AssertAuditedByDetailsAsync(admin, "ProductPricing", "Delete", productId.ToString());
    }

    [Fact]
    public async Task WarehousesAndCoverageAreas_AreAudited_OnCreateUpdateAndDelete()
    {
        var admin = await _factory.AdminAsync();
        var warehouse = await OkAsync<WarehouseDto>(await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(Unique("CD"), "Rua A, 1", -23.5, -46.6)));
        await AssertAuditedAsync(admin, "Warehouse", "Create", warehouse.Id);
        (await admin.PutAsJsonAsync($"/api/admin/warehouses/{warehouse.Id}", new UpsertWarehouseRequest(Unique("CD"), "Rua B, 2", -23.5, -46.6))).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Warehouse", "Update", warehouse.Id);

        var area = await OkAsync<CoverageAreaDto>(await admin.PostAsJsonAsync("/api/admin/coverage-areas", new UpsertCoverageAreaRequest(warehouse.Id, CoverageAreaType.Radius, 10, null)));
        await AssertAuditedAsync(admin, "CoverageArea", "Create", area.Id);
        (await admin.PutAsJsonAsync($"/api/admin/coverage-areas/{area.Id}", new UpsertCoverageAreaRequest(warehouse.Id, CoverageAreaType.Radius, 20, null))).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "CoverageArea", "Update", area.Id);
        (await admin.DeleteAsync($"/api/admin/coverage-areas/{area.Id}")).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "CoverageArea", "Delete", area.Id);

        (await admin.DeleteAsync($"/api/admin/warehouses/{warehouse.Id}")).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "Warehouse", "Delete", warehouse.Id);
    }

    [Fact]
    public async Task ClientsEmployeesAndInventory_AreAudited()
    {
        var admin = await _factory.AdminAsync();
        var (_, accountId) = await _factory.RegisterClientAsync();
        var tierId = (await OkAsync<PricingTierDto>(await admin.PostAsJsonAsync("/api/admin/pricing-tiers", new UpsertPricingTierRequest(Unique("Tier"), false)))).Id;

        (await admin.PutAsJsonAsync($"/api/admin/clients/{accountId}/approve", new ApproveClientRequest(tierId))).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "ClientAccount", "Approve", accountId);
        (await admin.PutAsync($"/api/admin/clients/{accountId}/suspend", null)).EnsureSuccessStatusCode();
        await AssertAuditedAsync(admin, "ClientAccount", "Suspend", accountId);

        var employee = await admin.PostAsJsonAsync("/api/admin/employees",
            new CreateEmployeeRequest($"{Guid.NewGuid()}@example.com", "Test1234!", Unique("E"), "Sales", DateTime.UtcNow));
        var employeeId = (await employee.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        await AssertAuditedAsync(admin, "EmployeeAccount", "Create", employeeId);

        var productId = await admin.CreateProductAsync();
        var warehouse = await OkAsync<WarehouseDto>(await admin.PostAsJsonAsync("/api/admin/warehouses", new UpsertWarehouseRequest(Unique("CD"), "Rua A, 1", -23.5, -46.6)));
        var stock = await admin.PutAsJsonAsync("/api/admin/inventory", new UpsertInventoryRequest(productId, warehouse.Id, 10, 2));
        stock.EnsureSuccessStatusCode();
        var recordId = (await admin.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/employee/inventory"))!
            .Single(r => r.GetProperty("productId").GetGuid() == productId).GetProperty("id").GetGuid();
        await AssertAuditedAsync(admin, "InventoryRecord", "Upsert", recordId);
    }

    // The change and its audit entry are one save: if the audit entry cannot be written, the change is not stored either.
    [Fact]
    public async Task AChange_IsNotStored_WhenItsAuditEntryCannotBeWritten()
    {
        using var factory = new FailingAuditFactory();
        var admin = await factory.AdminAsync();
        var name = Unique("NotStored");
        factory.FailAuditWrites = true;

        var failure = await Record.ExceptionAsync(async () =>
        {
            var response = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(name, 1, true));
            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        });
        factory.FailAuditWrites = false;

        Assert.True(failure is null || failure.Message.Contains("audit", StringComparison.OrdinalIgnoreCase) || failure is InvalidOperationException);
        var categories = (await admin.GetFromJsonAsync<List<CategoryAdminDto>>("/api/admin/categories"))!;
        Assert.DoesNotContain(categories, c => c.Name == name);
    }
}
