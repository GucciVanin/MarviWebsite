using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/admin/deals")]
[Authorize(Roles = "Admin")]
public class AdminDealsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminDealsController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DealAdminDto>>> GetDeals()
    {
        var deals = await _dbContext.Deals.ToListAsync();
        return Ok(deals.Select(ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DealAdminDto>> GetDeal(Guid id)
    {
        var deal = await _dbContext.Deals.FirstOrDefaultAsync(d => d.Id == id);
        if (deal is null)
        {
            return NotFound();
        }

        return Ok(ToDto(deal));
    }

    [HttpPost]
    public async Task<ActionResult<DealAdminDto>> CreateDeal(UpsertDealRequest request)
    {
        var error = Validate(request);
        if (error is not null)
        {
            return BadRequest(error);
        }

        if (!await CategoriesExistAsync(request.CategoryIds))
        {
            return BadRequest("Unknown category.");
        }

        var deal = new Deal
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            DiscountType = request.DiscountType,
            DiscountValue = request.DiscountValue,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            ProductIds = request.ProductIds,
            CategoryIds = request.CategoryIds,
            MinQty = request.MinQty
        };

        _dbContext.Deals.Add(deal);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Create", nameof(Deal), deal.Id, request);

        return CreatedAtAction(nameof(GetDeal), new { id = deal.Id }, ToDto(deal));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateDeal(Guid id, UpsertDealRequest request)
    {
        var deal = await _dbContext.Deals.FirstOrDefaultAsync(d => d.Id == id);
        if (deal is null)
        {
            return NotFound();
        }

        var error = Validate(request);
        if (error is not null)
        {
            return BadRequest(error);
        }

        if (!await CategoriesExistAsync(request.CategoryIds))
        {
            return BadRequest("Unknown category.");
        }

        deal.Name = request.Name;
        deal.DiscountType = request.DiscountType;
        deal.DiscountValue = request.DiscountValue;
        deal.StartDate = request.StartDate;
        deal.EndDate = request.EndDate;
        deal.ProductIds = request.ProductIds;
        deal.CategoryIds = request.CategoryIds;
        deal.MinQty = request.MinQty;
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Update", nameof(Deal), id, request);

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteDeal(Guid id)
    {
        var deal = await _dbContext.Deals.FirstOrDefaultAsync(d => d.Id == id);
        if (deal is null)
        {
            return NotFound();
        }

        _dbContext.Deals.Remove(deal);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Delete", nameof(Deal), id);

        return NoContent();
    }

    private static string? Validate(UpsertDealRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return "Name is required.";
        }

        if (!Enum.IsDefined(request.DiscountType))
        {
            return "Unknown discount type.";
        }

        // A percentage over 100 or a fixed amount below 0 would make the price negative or raise it; both are typos.
        if (request.DiscountValue < 0 || (request.DiscountType == DiscountType.Percent && request.DiscountValue > 100))
        {
            return "A percentage discount must be between 0 and 100, and a fixed discount cannot be negative.";
        }

        if (request.StartDate >= request.EndDate)
        {
            return "The deal must end after it starts.";
        }

        if (request.MinQty < 1)
        {
            return "Minimum quantity must be at least 1.";
        }

        if (request.ProductIds is null || request.CategoryIds is null)
        {
            return "ProductIds and CategoryIds are required (use empty lists for none).";
        }

        return null;
    }

    // A deal's category ids are a plain list (no foreign key), so each one is checked here; an unknown id would
    // otherwise be stored and silently never match anything.
    private async Task<bool> CategoriesExistAsync(List<Guid> categoryIds)
    {
        var distinct = categoryIds.Distinct().ToList();
        return distinct.Count == 0 || await _dbContext.Categories.CountAsync(c => distinct.Contains(c.Id)) == distinct.Count;
    }

    private static DealAdminDto ToDto(Deal deal) =>
        new(deal.Id, deal.Name, deal.DiscountType, deal.DiscountValue, deal.StartDate, deal.EndDate, deal.ProductIds, deal.CategoryIds, deal.MinQty);
}
