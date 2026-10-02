using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Infrastructure.Data;
using Marvi.Infrastructure.Geocoding;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Coverage;

[ApiController]
[Route("api/coverage")]
public class CoverageController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly CoverageService _coverageService;
    private readonly IGeocodingProvider _geocodingProvider;

    public CoverageController(AppDbContext dbContext, CoverageService coverageService, IGeocodingProvider geocodingProvider)
    {
        _dbContext = dbContext;
        _coverageService = coverageService;
        _geocodingProvider = geocodingProvider;
    }

    [AllowAnonymous]
    [HttpPost("check")]
    public async Task<ActionResult<CoverageCheckResultDto>> Check(CoverageCheckRequest request)
    {
        var geocodeResult = await _geocodingProvider.GeocodeAsync(request.Address);
        if (geocodeResult is null)
        {
            return Ok(new CoverageCheckResultDto(false, null));
        }

        var warehouses = await _dbContext.Warehouses
            .Include(w => w.CoverageAreas)
            .ToListAsync();

        // Phase 1 only supports Radius areas — Polygon areas are filtered out (Phase 2 TODO, see CoverageService).
        var areas = warehouses
            .SelectMany(w => w.CoverageAreas
                .Where(a => a.Type == CoverageAreaType.Radius)
                .Select(a => (Warehouse: w, Area: a)));

        var result = _coverageService.CheckCoverage(geocodeResult.Lat, geocodeResult.Lng, areas);

        return Ok(new CoverageCheckResultDto(result.Supported, result.Warehouse?.Name));
    }
}
