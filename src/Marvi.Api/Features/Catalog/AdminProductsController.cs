using Marvi.Api.Features.Admin;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/admin/products")]
[Authorize(Roles = "Admin")]
public class AdminProductsController : ControllerBase
{
    private const string InUseMessage = "The product appears on quotes or orders and cannot be deleted. Deactivate it instead.";

    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminProductsController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductAdminDto>>> GetProducts()
    {
        var products = await _dbContext.Products.ToListAsync();
        return Ok(products.Select(ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductAdminDto>> GetProduct(Guid id)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        return Ok(ToDto(product));
    }

    [HttpPost]
    public async Task<ActionResult<ProductAdminDto>> CreateProduct(UpsertProductRequest request)
    {
        var invalid = await ValidateAsync(request, existingId: null);
        if (invalid is not null)
        {
            return invalid.ToResult(this);
        }

        if (!await CategoryExistsAsync(request.CategoryId))
        {
            return BadRequest("Unknown category.");
        }

        var product = new Product
        {
            Id = Guid.NewGuid(),
            Sku = AdminInput.Clean(request.Sku),
            Name = AdminInput.Clean(request.Name),
            Description = request.Description,
            CategoryId = request.CategoryId,
            ImageUrl = request.ImageUrl,
            IsActive = request.IsActive,
            Attributes = request.Attributes
        };

        _dbContext.Products.Add(product);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Create, nameof(Product), product.Id, request))
        {
            return Conflict("The product conflicts with existing data (duplicate SKU, or its category was just removed).");
        }

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, ToDto(product));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateProduct(Guid id, UpsertProductRequest request)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        var invalid = await ValidateAsync(request, existingId: id);
        if (invalid is not null)
        {
            return invalid.ToResult(this);
        }

        if (!await CategoryExistsAsync(request.CategoryId))
        {
            return BadRequest("Unknown category.");
        }

        product.Sku = AdminInput.Clean(request.Sku);
        product.Name = AdminInput.Clean(request.Name);
        product.Description = request.Description;
        product.CategoryId = request.CategoryId;
        product.ImageUrl = request.ImageUrl;
        product.IsActive = request.IsActive;
        product.Attributes = request.Attributes;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(Product), id, request))
        {
            return Conflict("The product conflicts with existing data (duplicate SKU, or its category was just removed).");
        }

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteProduct(Guid id)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        // Quote and order lines keep a product's name, price and quantity as history. Deleting the product would
        // delete those lines and corrupt the totals, so a product with history can only be deactivated.
        var blocked = await DeleteGuards.BlockingMessageAsync(new DeleteGuard(
            async () => await _dbContext.OrderLineItems.AnyAsync(l => l.ProductId == id) || await _dbContext.QuoteLineItems.AnyAsync(l => l.ProductId == id),
            InUseMessage));
        if (blocked is not null)
        {
            return Conflict(blocked);
        }

        _dbContext.Products.Remove(product);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Delete, nameof(Product), id))
        {
            return Conflict(InUseMessage);
        }

        return NoContent();
    }


    // SKU and name are required and bounded; the SKU is unique ignoring case (also enforced by an index, which turns a
    // race into a conflict through TrySaveAsync).
    private async Task<InputProblem?> ValidateAsync(UpsertProductRequest request, Guid? existingId)
    {
        var sku = AdminInput.Clean(request.Sku);
        var name = AdminInput.Clean(request.Name);
        if (AdminInput.IsBlank(sku) || AdminInput.IsBlank(name))
        {
            return InputProblem.BadRequest("SKU and name are required.");
        }

        if (AdminInput.ExceedsLength(sku, ProductRules.MaxSkuLength) || AdminInput.ExceedsLength(name, ProductRules.MaxNameLength))
        {
            return InputProblem.BadRequest($"SKU is limited to {ProductRules.MaxSkuLength} characters and name to {ProductRules.MaxNameLength}.");
        }

        if (await _dbContext.Products.Where(p => p.Id != existingId).AnyAsync(AdminInput.EqualsIgnoreCase<Product>(p => p.Sku, sku)))
        {
            return InputProblem.Conflict("A product with this SKU already exists.");
        }

        return null;
    }

    // A product may have no category; when it has one, it must be a real category.
    private async Task<bool> CategoryExistsAsync(Guid? categoryId) =>
        categoryId is null || await _dbContext.Categories.AnyAsync(c => c.Id == categoryId);

    private static ProductAdminDto ToDto(Product product) =>
        new(product.Id, product.Sku, product.Name, product.Description, product.CategoryId, product.ImageUrl, product.IsActive, product.Attributes);
}
