using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

/// <summary>Per-tier unit prices (with quantity breaks) for a product.</summary>
[ApiController]
[Route("api/admin/products/{productId:guid}/pricing")]
[Authorize(Roles = "Admin")]
public class AdminProductPricingController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminProductPricingController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductPricingDto>>> GetPricing(Guid productId)
    {
        if (!await _dbContext.Products.AnyAsync(p => p.Id == productId))
        {
            return NotFound();
        }

        var rows = await _dbContext.ProductPricings
            .Include(pp => pp.PricingTier)
            .Where(pp => pp.ProductId == productId)
            .OrderBy(pp => pp.PricingTier!.Name).ThenBy(pp => pp.MinQty)
            .ToListAsync();

        return Ok(rows.Select(ToDto));
    }

    /// <summary>Creates the price row for (tier, minQty), or replaces its unit price if it already exists.</summary>
    [HttpPut]
    public async Task<ActionResult<ProductPricingDto>> UpsertPricing(Guid productId, UpsertProductPricingRequest request)
    {
        if (request.UnitPrice < 0)
        {
            return BadRequest("Unit price cannot be negative.");
        }

        if (request.MinQty < 1)
        {
            return BadRequest("Minimum quantity must be at least 1.");
        }

        if (!await _dbContext.Products.AnyAsync(p => p.Id == productId))
        {
            return NotFound();
        }

        var tier = await _dbContext.PricingTiers.FirstOrDefaultAsync(t => t.Id == request.PricingTierId);
        if (tier is null)
        {
            return BadRequest("Pricing tier not found.");
        }

        var row = await _dbContext.ProductPricings
            .FirstOrDefaultAsync(pp => pp.ProductId == productId && pp.PricingTierId == tier.Id && pp.MinQty == request.MinQty);
        if (row is null)
        {
            row = new ProductPricing
            {
                Id = Guid.NewGuid(),
                ProductId = productId,
                PricingTierId = tier.Id,
                MinQty = request.MinQty
            };
            _dbContext.ProductPricings.Add(row);
        }

        row.UnitPrice = request.UnitPrice;
        row.PricingTier = tier;
        await _dbContext.SaveChangesAsync();
        await _auditLogger.LogAsync("Upsert", nameof(ProductPricing), row.Id, new { productId, request.PricingTierId, request.UnitPrice, request.MinQty });

        return Ok(ToDto(row));
    }

    [HttpDelete("{pricingTierId:guid}/{minQty:int}")]
    public async Task<IActionResult> DeletePricing(Guid productId, Guid pricingTierId, int minQty)
    {
        var row = await _dbContext.ProductPricings
            .FirstOrDefaultAsync(pp => pp.ProductId == productId && pp.PricingTierId == pricingTierId && pp.MinQty == minQty);
        if (row is null)
        {
            return NotFound();
        }

        _dbContext.ProductPricings.Remove(row);
        await _dbContext.SaveChangesAsync();
        await _auditLogger.LogAsync("Delete", nameof(ProductPricing), row.Id, new { productId, pricingTierId, minQty });

        return NoContent();
    }

    private static ProductPricingDto ToDto(ProductPricing row) =>
        new(row.PricingTierId, row.PricingTier?.Name ?? string.Empty, row.UnitPrice, row.MinQty);
}
