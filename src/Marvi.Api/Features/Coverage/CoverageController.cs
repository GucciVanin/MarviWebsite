using Marvi.Api.Configuration;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Infrastructure.Data;
using Marvi.Infrastructure.Geocoding;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    [EnableRateLimiting(RateLimiting.CoveragePolicy)]
    [HttpPost("check")]
    public async Task<ActionResult<CoverageCheckResultDto>> Check(CoverageCheckRequest request)
    {
        // "Address not found" and "provider unavailable" are different facts (the adapter logs the latter), but the
        // visitor is told the same thing today; showing a distinct "try again later" message is an owner decision.
        var geocode = await _geocodingProvider.GeocodeAsync(request.Address);
        if (geocode.Status != GeocodeStatus.Found)
        {
            return Ok(new CoverageCheckResultDto(false, null));
        }

        var geocodeResult = geocode.Location!;

        var warehouses = await _dbContext.Warehouses
            .Include(w => w.CoverageAreas)
            .ToListAsync();

        var result = _coverageService.CheckCoverage(geocodeResult.Lat, geocodeResult.Lng, warehouses);

        return Ok(new CoverageCheckResultDto(result.Supported, result.Warehouse?.Name));
    }
}
