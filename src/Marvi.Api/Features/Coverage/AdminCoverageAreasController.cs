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
        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return BadRequest(error);
        }

        var area = new CoverageArea
        {
            Id = Guid.NewGuid(),
            WarehouseId = request.WarehouseId,
            Type = request.Type,
            RadiusMiles = request.RadiusMiles,
            PolygonGeoJson = PolygonFor(request)
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

        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return BadRequest(error);
        }

        area.WarehouseId = request.WarehouseId;
        area.Type = request.Type;
        area.RadiusMiles = request.RadiusMiles;
        area.PolygonGeoJson = PolygonFor(request);
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

    private async Task<string?> ValidateAsync(UpsertCoverageAreaRequest request)
    {
        if (!await _dbContext.Warehouses.AnyAsync(w => w.Id == request.WarehouseId))
        {
            return "Unknown warehouse.";
        }

        if (!Enum.IsDefined(request.Type))
        {
            return "Unknown coverage area type.";
        }

        // 20,000 miles is already more than half the planet's circumference; anything larger is a typo.
        if (request.Type == CoverageAreaType.Radius && (request.RadiusMiles is not > 0 or > 20000 || !double.IsFinite(request.RadiusMiles.Value)))
        {
            return "A radius area needs a radius greater than 0 and at most 20000 miles.";
        }

        if (request.Type == CoverageAreaType.Polygon && !IsJsonObject(request.PolygonGeoJson))
        {
            return "A polygon area needs its GeoJSON (a valid JSON object).";
        }

        return null;
    }

    private static bool IsJsonObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(json);
            return document.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object;
        }
        catch (System.Text.Json.JsonException)
        {
            return false;
        }
    }

    // A radius area has no polygon; a stray one sent along would be stored beside it and confuse polygon coverage later.
    private static string? PolygonFor(UpsertCoverageAreaRequest request) =>
        request.Type == CoverageAreaType.Polygon ? request.PolygonGeoJson : null;

    private static CoverageAreaDto ToDto(CoverageArea area) =>
        new(area.Id, area.WarehouseId, area.Type, area.RadiusMiles, area.PolygonGeoJson);
}
