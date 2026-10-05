using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/admin/categories")]
[Authorize(Roles = "Admin")]
public class AdminCategoriesController : ControllerBase
{
    // Also keeps a name under the btree index row limit (~2.7 KB) that backs ix_categories_name_lower.
    private const int MaxNameLength = 200;

    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminCategoriesController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CategoryAdminDto>>> GetCategories()
    {
        var categories = await _dbContext.Categories.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync();
        var counts = await _dbContext.Products
            .Where(p => p.CategoryId != null)
            .GroupBy(p => p.CategoryId!.Value)
            .Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CategoryId, x => x.Count);

        return Ok(categories.Select(c => ToDto(c, counts.GetValueOrDefault(c.Id))));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CategoryAdminDto>> GetCategory(Guid id)
    {
        var category = await _dbContext.Categories.FirstOrDefaultAsync(c => c.Id == id);
        if (category is null)
        {
            return NotFound();
        }

        return Ok(ToDto(category, await CountProductsAsync(id)));
    }

    [HttpPost]
    public async Task<ActionResult<CategoryAdminDto>> CreateCategory(UpsertCategoryRequest request)
    {
        var error = await ValidateAsync(request, existingId: null);
        if (error is not null)
        {
            return error;
        }

        var category = new Category
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            SortOrder = request.SortOrder,
            IsActive = request.IsActive
        };

        _dbContext.Categories.Add(category);
        if (!await TrySaveAsync())
        {
            return Conflict("A category with this name already exists.");
        }

        await _auditLogger.LogAsync("Create", nameof(Category), category.Id, request);

        return CreatedAtAction(nameof(GetCategory), new { id = category.Id }, ToDto(category, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CategoryAdminDto>> UpdateCategory(Guid id, UpsertCategoryRequest request)
    {
        var category = await _dbContext.Categories.FirstOrDefaultAsync(c => c.Id == id);
        if (category is null)
        {
            return NotFound();
        }

        var error = await ValidateAsync(request, existingId: id);
        if (error is not null)
        {
            return error;
        }

        category.Name = request.Name.Trim();
        category.SortOrder = request.SortOrder;
        category.IsActive = request.IsActive;
        if (!await TrySaveAsync())
        {
            return Conflict("A category with this name already exists.");
        }

        await _auditLogger.LogAsync("Update", nameof(Category), id, request);

        return Ok(ToDto(category, await CountProductsAsync(id)));
    }

    // Categories in use are deactivated, not deleted, so products and deals never point at nothing.
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id)
    {
        var category = await _dbContext.Categories.FirstOrDefaultAsync(c => c.Id == id);
        if (category is null)
        {
            return NotFound();
        }

        if (await _dbContext.Products.AnyAsync(p => p.CategoryId == id))
        {
            return Conflict("The category still has products. Move them or deactivate the category instead.");
        }

        if (await _dbContext.Deals.AnyAsync(d => d.CategoryIds.Contains(id)))
        {
            return Conflict("A deal still targets this category. Update the deal or deactivate the category instead.");
        }

        _dbContext.Categories.Remove(category);
        if (!await TrySaveAsync())
        {
            return Conflict("The category is still in use. Deactivate it instead.");
        }

        await _auditLogger.LogAsync("Delete", nameof(Category), id);

        return NoContent();
    }

    private async Task<ActionResult?> ValidateAsync(UpsertCategoryRequest request, Guid? existingId)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var name = request.Name.Trim();
        if (name.Length > MaxNameLength)
        {
            return BadRequest($"Name must be at most {MaxNameLength} characters.");
        }

        var duplicate = await _dbContext.Categories.AnyAsync(c => c.Id != existingId && c.Name.ToLower() == name.ToLower());
        return duplicate ? Conflict("A category with this name already exists.") : null;
    }

    // Concurrent requests can pass the pre-checks above and still hit the unique name index or the restrict
    // foreign key; report exactly that as a conflict. Any other database failure is a real error and propagates.
    private async Task<bool> TrySaveAsync()
    {
        try
        {
            await _dbContext.SaveChangesAsync();
            return true;
        }
        catch (DbUpdateException exception) when (exception.IsConstraintViolation())
        {
            return false;
        }
    }

    private Task<int> CountProductsAsync(Guid categoryId) =>
        _dbContext.Products.CountAsync(p => p.CategoryId == categoryId);

    private static CategoryAdminDto ToDto(Category category, int productCount) =>
        new(category.Id, category.Name, category.SortOrder, category.IsActive, productCount);
}
