using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Coverage;

[ApiController]
[Route("api/admin/coverage-areas")]
[Authorize(Roles = "Admin")]
public class AdminCoverageAreasController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminCoverageAreasController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CoverageAreaDto>>> GetCoverageAreas()
    {
        var areas = await _dbContext.CoverageAreas.ToListAsync();
        return Ok(areas.Select(ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CoverageAreaDto>> GetCoverageArea(Guid id)
    {
        var area = await _dbContext.CoverageAreas.FirstOrDefaultAsync(a => a.Id == id);
        if (area is null)
        {
            return NotFound();
        }

        return Ok(ToDto(area));
    }

    [HttpPost]
    public async Task<ActionResult<CoverageAreaDto>> CreateCoverageArea(UpsertCoverageAreaRequest request)
    {
        var area = new CoverageArea
        {
            Id = Guid.NewGuid(),
            WarehouseId = request.WarehouseId,
            Type = request.Type,
            RadiusMiles = request.RadiusMiles,
            PolygonGeoJson = request.PolygonGeoJson
        };

        _dbContext.CoverageAreas.Add(area);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Create", nameof(CoverageArea), area.Id, request);

        return CreatedAtAction(nameof(GetCoverageArea), new { id = area.Id }, ToDto(area));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateCoverageArea(Guid id, UpsertCoverageAreaRequest request)
    {
        var area = await _dbContext.CoverageAreas.FirstOrDefaultAsync(a => a.Id == id);
        if (area is null)
        {
            return NotFound();
        }

        area.WarehouseId = request.WarehouseId;
        area.Type = request.Type;
        area.RadiusMiles = request.RadiusMiles;
        area.PolygonGeoJson = request.PolygonGeoJson;
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Update", nameof(CoverageArea), id, request);

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteCoverageArea(Guid id)
    {
        var area = await _dbContext.CoverageAreas.FirstOrDefaultAsync(a => a.Id == id);
        if (area is null)
        {
            return NotFound();
        }

        _dbContext.CoverageAreas.Remove(area);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Delete", nameof(CoverageArea), id);

        return NoContent();
    }

    private static CoverageAreaDto ToDto(CoverageArea area) =>
        new(area.Id, area.WarehouseId, area.Type, area.RadiusMiles, area.PolygonGeoJson);
}
