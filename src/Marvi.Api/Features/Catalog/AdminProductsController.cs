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
    private const int MaxSkuLength = 64;
    private const int MaxNameLength = 200;

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
            return invalid;
        }

        if (!await CategoryExistsAsync(request.CategoryId))
        {
            return BadRequest("Unknown category.");
        }

        var product = new Product
        {
            Id = Guid.NewGuid(),
            Sku = request.Sku.Trim(),
            Name = request.Name.Trim(),
            Description = request.Description,
            CategoryId = request.CategoryId,
            ImageUrl = request.ImageUrl,
            IsActive = request.IsActive,
            Attributes = request.Attributes
        };

        _dbContext.Products.Add(product);
        if (!await TrySaveAsync())
        {
            return Conflict("The product conflicts with existing data (duplicate SKU, or its category was just removed).");
        }

        await _auditLogger.LogAsync("Create", nameof(Product), product.Id, request);

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
            return invalid;
        }

        if (!await CategoryExistsAsync(request.CategoryId))
        {
            return BadRequest("Unknown category.");
        }

        product.Sku = request.Sku.Trim();
        product.Name = request.Name.Trim();
        product.Description = request.Description;
        product.CategoryId = request.CategoryId;
        product.ImageUrl = request.ImageUrl;
        product.IsActive = request.IsActive;
        product.Attributes = request.Attributes;
        if (!await TrySaveAsync())
        {
            return Conflict("The product conflicts with existing data (duplicate SKU, or its category was just removed).");
        }

        await _auditLogger.LogAsync("Update", nameof(Product), id, request);

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
        if (await _dbContext.OrderLineItems.AnyAsync(l => l.ProductId == id) || await _dbContext.QuoteLineItems.AnyAsync(l => l.ProductId == id))
        {
            return Conflict("The product appears on quotes or orders and cannot be deleted. Deactivate it instead.");
        }

        _dbContext.Products.Remove(product);
        if (!await TrySaveAsync())
        {
            return Conflict("The product appears on quotes or orders and cannot be deleted. Deactivate it instead.");
        }

        await _auditLogger.LogAsync("Delete", nameof(Product), id);

        return NoContent();
    }

    // The category can be deleted between the existence check above and the save; the foreign key then rejects the
    // write, which is a client error (unknown category), not a 500. Other database failures propagate.
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

    // SKU and name are required and bounded; the SKU is unique ignoring case (also enforced by an index, which turns a
    // race into a conflict through TrySaveAsync).
    private async Task<ActionResult?> ValidateAsync(UpsertProductRequest request, Guid? existingId)
    {
        var sku = request.Sku?.Trim();
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(sku) || string.IsNullOrWhiteSpace(name))
        {
            return BadRequest("SKU and name are required.");
        }

        if (sku.Length > MaxSkuLength || name.Length > MaxNameLength)
        {
            return BadRequest($"SKU is limited to {MaxSkuLength} characters and name to {MaxNameLength}.");
        }

        var skuLower = sku.ToLower();
        if (await _dbContext.Products.AnyAsync(p => p.Id != existingId && p.Sku.ToLower() == skuLower))
        {
            return Conflict("A product with this SKU already exists.");
        }

        return null;
    }

    // A product may have no category; when it has one, it must be a real category.
    private async Task<bool> CategoryExistsAsync(Guid? categoryId) =>
        categoryId is null || await _dbContext.Categories.AnyAsync(c => c.Id == categoryId);

    private static ProductAdminDto ToDto(Product product) =>
        new(product.Id, product.Sku, product.Name, product.Description, product.CategoryId, product.ImageUrl, product.IsActive, product.Attributes);
}
