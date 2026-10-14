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
        if (AdminInput.IsBlank(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var tier = new PricingTier { Id = Guid.NewGuid(), Name = AdminInput.Clean(request.Name) };
        _dbContext.PricingTiers.Add(tier);

        if (await DefaultPricingTier.ShouldBeDefaultAsync(_dbContext, request.IsDefault))
        {
            await DefaultPricingTier.MakeDefaultAsync(_dbContext, tier);
        }

        if (!await _auditLogger.TrySaveAsync(AuditActions.Create, nameof(PricingTier), tier.Id, request))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

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

        if (AdminInput.IsBlank(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var defaultProblem = await DefaultPricingTier.ApplyRequestedDefaultAsync(_dbContext, tier, request.IsDefault);
        if (defaultProblem is not null)
        {
            return BadRequest(defaultProblem);
        }

        tier.Name = AdminInput.Clean(request.Name);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(PricingTier), tier.Id, request))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return Ok(ToDto(tier));
    }

    private static PricingTierDto ToDto(PricingTier tier) => new(tier.Id, tier.Name, tier.IsDefault);
}
