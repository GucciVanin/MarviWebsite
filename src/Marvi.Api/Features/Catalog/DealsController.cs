using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/deals")]
public class DealsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public DealsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DealDto>>> GetDeals()
    {
        var now = DateTime.UtcNow;
        var deals = await _dbContext.Deals
            .Where(d => d.StartDate <= now && d.EndDate >= now)
            .Select(d => new DealDto(d.Id, d.Name, d.DiscountType, d.DiscountValue, d.StartDate, d.EndDate))
            .ToListAsync();

        return Ok(deals);
    }
}
