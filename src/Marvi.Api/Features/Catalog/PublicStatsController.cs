using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

/// <summary>What the landing page shows as live numbers (MRV-2.3b). Anonymous and cached briefly; counts only.</summary>
[ApiController]
[Route("api/public/stats")]
[AllowAnonymous]
public class PublicStatsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public PublicStatsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any)]
    public async Task<ActionResult<PublicStatsDto>> GetStats()
    {
        var products = await _dbContext.Products.CountAsync(p => p.IsActive);
        var categories = await _dbContext.Categories.CountAsync(c => c.IsActive);

        // Polygon areas are stored but the delivery check cannot serve them yet, so only radius areas count as network.
        var coverageAreas = await _dbContext.CoverageAreas.CountAsync(a => a.Type == CoverageAreaType.Radius);

        return Ok(new PublicStatsDto(products, categories, coverageAreas));
    }
}
