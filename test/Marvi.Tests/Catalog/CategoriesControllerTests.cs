using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Catalog;

public class CategoriesControllerTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public CategoriesControllerTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task PublicList_IsAnonymous_ShowsOnlyActiveCategoriesInOrder_WithActiveProductCounts()
    {
        var admin = await LoginAsAdminAsync();
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var second = await CreateCategoryAsync(admin, $"B-{suffix}", sortOrder: 2);
        var first = await CreateCategoryAsync(admin, $"A-{suffix}", sortOrder: 1);
        var hidden = await CreateCategoryAsync(admin, $"Hidden-{suffix}", sortOrder: 0, isActive: false);
        await CreateProductAsync(admin, first.Id, isActive: true);
        await CreateProductAsync(admin, first.Id, isActive: false);

        var list = await _factory.CreateClient().GetFromJsonAsync<List<CategoryDto>>("/api/categories");

        Assert.NotNull(list);
        var ours = list!.Where(c => c.Id == first.Id || c.Id == second.Id || c.Id == hidden.Id).ToList();
        Assert.Equal(new[] { first.Id, second.Id }, ours.Select(c => c.Id));
        Assert.Equal(1, ours[0].ProductCount);
        Assert.Equal(0, ours[1].ProductCount);
    }

    [Fact]
    public async Task AdminEndpoints_RequireAdminRole()
    {
        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/categories")).StatusCode);

        var email = $"{Guid.NewGuid()}@example.com";
        await anonymous.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Test1234!", "Acme Co", "123 Main St"));
        var clientHttp = await LoginAsync(email, "Test1234!");

        var response = await clientHttp.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest("Nope", 0, true));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_RejectsBlankAndDuplicateNames_IgnoringCase()
    {
        var admin = await LoginAsAdminAsync();
        var name = $"Beer-{Guid.NewGuid():N}";
        await CreateCategoryAsync(admin, name);

        var blank = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest("   ", 0, true));
        var duplicate = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(name.ToUpperInvariant(), 0, true));

        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task Create_RejectsNamesLongerThan200Characters_ButAcceptsExactly200()
    {
        var admin = await LoginAsAdminAsync();
        var unique = Guid.NewGuid().ToString("N");

        var tooLong = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(unique + new string('x', 200), 0, true));
        var exact = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest((unique + new string('y', 200))[..200], 0, true));

        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.Created, exact.StatusCode);
    }

    [Fact]
    public async Task Update_ChangesFields_AllowsKeepingOwnName_AndIsAudited()
    {
        var admin = await LoginAsAdminAsync();
        var category = await CreateCategoryAsync(admin, $"Water-{Guid.NewGuid():N}");

        var response = await admin.PutAsJsonAsync($"/api/admin/categories/{category.Id}", new UpsertCategoryRequest(category.Name, 7, false));
        response.EnsureSuccessStatusCode();
        var updated = (await response.Content.ReadFromJsonAsync<CategoryAdminDto>())!;

        Assert.Equal(7, updated.SortOrder);
        Assert.False(updated.IsActive);
        Assert.Equal(HttpStatusCode.NotFound,
            (await admin.PutAsJsonAsync($"/api/admin/categories/{Guid.NewGuid()}", new UpsertCategoryRequest("X", 0, true))).StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True(await db.AuditLogEntries.AnyAsync(a => a.EntityId == category.Id && a.Action == "Update"));
    }

    [Fact]
    public async Task Delete_IsBlockedWhileProductsUseTheCategory_ThenSucceeds()
    {
        var admin = await LoginAsAdminAsync();
        var category = await CreateCategoryAsync(admin, $"Mixers-{Guid.NewGuid():N}");
        var productId = await CreateProductAsync(admin, category.Id, isActive: true);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/admin/categories/{category.Id}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/products/{productId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/categories/{category.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/categories/{category.Id}")).StatusCode);
    }

    [Fact]
    public async Task Delete_IsBlockedWhileADealTargetsTheCategory()
    {
        var admin = await LoginAsAdminAsync();
        var category = await CreateCategoryAsync(admin, $"Deals-{Guid.NewGuid():N}");
        var deal = await admin.PostAsJsonAsync("/api/admin/deals", new UpsertDealRequest(
            "Summer", Marvi.Domain.Catalog.DiscountType.Percent, 10m, DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1), [], [category.Id], 1));
        deal.EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Conflict, (await admin.DeleteAsync($"/api/admin/categories/{category.Id}")).StatusCode);
    }

    [Fact]
    public async Task Deals_RejectUnknownCategories_OnCreateAndUpdate()
    {
        var admin = await LoginAsAdminAsync();
        var category = await CreateCategoryAsync(admin, $"DealCat-{Guid.NewGuid():N}");
        UpsertDealRequest Deal(params Guid[] categoryIds) => new(
            "Verão", Marvi.Domain.Catalog.DiscountType.Percent, 10m, DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1), [], [.. categoryIds], 1);

        var unknown = await admin.PostAsJsonAsync("/api/admin/deals", Deal(category.Id, Guid.NewGuid()));
        var valid = await admin.PostAsJsonAsync("/api/admin/deals", Deal(category.Id));
        var dealId = (await valid.Content.ReadFromJsonAsync<DealAdminDto>())!.Id;
        var updateUnknown = await admin.PutAsJsonAsync($"/api/admin/deals/{dealId}", Deal(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.Created, valid.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, updateUnknown.StatusCode);
    }

    [Fact]
    public async Task Products_RejectUnknownCategory_ButAllowNone()
    {
        var admin = await LoginAsAdminAsync();
        var attributes = new Dictionary<string, string>();

        var unknown = await admin.PostAsJsonAsync("/api/admin/products",
            new UpsertProductRequest($"SKU-{Guid.NewGuid():N}", "Widget", null, Guid.NewGuid(), null, true, attributes));
        var none = await admin.PostAsJsonAsync("/api/admin/products",
            new UpsertProductRequest($"SKU-{Guid.NewGuid():N}", "Widget", null, null, null, true, attributes));

        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.Created, none.StatusCode);
    }

    private static async Task<CategoryAdminDto> CreateCategoryAsync(HttpClient admin, string name, int sortOrder = 0, bool isActive = true)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/categories", new UpsertCategoryRequest(name, sortOrder, isActive));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CategoryAdminDto>())!;
    }

    private static async Task<Guid> CreateProductAsync(HttpClient admin, Guid categoryId, bool isActive)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/products",
            new UpsertProductRequest($"SKU-{Guid.NewGuid():N}", "Widget", null, categoryId, null, isActive, new Dictionary<string, string>()));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProductAdminDto>())!.Id;
    }

    private Task<HttpClient> LoginAsAdminAsync() => LoginAsync(MarviApiFactory.AdminEmail, MarviApiFactory.AdminPassword);

    private async Task<HttpClient> LoginAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return client;
    }
}
