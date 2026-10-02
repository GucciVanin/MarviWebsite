using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/admin/pricing-tiers")]
[Authorize(Roles = "Admin")]
public class AdminPricingTiersController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminPricingTiersController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<PricingTierDto>>> GetTiers()
    {
        var tiers = await _dbContext.PricingTiers.OrderBy(t => t.Name).ToListAsync();
        return Ok(tiers.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<PricingTierDto>> CreateTier(UpsertPricingTierRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var tier = new PricingTier { Id = Guid.NewGuid(), Name = request.Name.Trim() };
        _dbContext.PricingTiers.Add(tier);

        // The first tier ever created is always the default, whatever the request says.
        var makeDefault = request.IsDefault || !await _dbContext.PricingTiers.AnyAsync(t => t.IsDefault);
        if (makeDefault)
        {
            await ClearDefaultAsync();
            tier.IsDefault = true;
        }

        await _dbContext.SaveChangesAsync();
        await _auditLogger.LogAsync("Create", nameof(PricingTier), tier.Id, request);

        return Created(string.Empty, ToDto(tier));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PricingTierDto>> UpdateTier(Guid id, UpsertPricingTierRequest request)
    {
        var tier = await _dbContext.PricingTiers.FirstOrDefaultAsync(t => t.Id == id);
        if (tier is null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        if (tier.IsDefault && !request.IsDefault)
        {
            return BadRequest("A default tier is required. Make another tier the default instead.");
        }

        if (request.IsDefault && !tier.IsDefault)
        {
            await ClearDefaultAsync();
            tier.IsDefault = true;
        }

        tier.Name = request.Name.Trim();
        await _dbContext.SaveChangesAsync();
        await _auditLogger.LogAsync("Update", nameof(PricingTier), tier.Id, request);

        return Ok(ToDto(tier));
    }

    private async Task ClearDefaultAsync()
    {
        var current = await _dbContext.PricingTiers.Where(t => t.IsDefault).ToListAsync();
        foreach (var existing in current)
        {
            existing.IsDefault = false;
        }

        // Flush the un-flagging first so the unique "single default" index is never violated.
        await _dbContext.SaveChangesAsync();
    }

    private static PricingTierDto ToDto(PricingTier tier) => new(tier.Id, tier.Name, tier.IsDefault);
}
