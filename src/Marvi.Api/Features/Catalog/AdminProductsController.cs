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
        var product = new Product
        {
            Id = Guid.NewGuid(),
            Sku = request.Sku,
            Name = request.Name,
            Description = request.Description,
            CategoryId = request.CategoryId,
            ImageUrl = request.ImageUrl,
            IsActive = request.IsActive,
            Attributes = request.Attributes
        };

        _dbContext.Products.Add(product);
        await _dbContext.SaveChangesAsync();

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

        product.Sku = request.Sku;
        product.Name = request.Name;
        product.Description = request.Description;
        product.CategoryId = request.CategoryId;
        product.ImageUrl = request.ImageUrl;
        product.IsActive = request.IsActive;
        product.Attributes = request.Attributes;
        await _dbContext.SaveChangesAsync();

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

        _dbContext.Products.Remove(product);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Delete", nameof(Product), id);

        return NoContent();
    }

    private static ProductAdminDto ToDto(Product product) =>
        new(product.Id, product.Sku, product.Name, product.Description, product.CategoryId, product.ImageUrl, product.IsActive, product.Attributes);
}
