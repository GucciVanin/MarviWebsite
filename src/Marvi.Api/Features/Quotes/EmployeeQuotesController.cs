using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Quotes;

[ApiController]
[Route("api/employee/quotes")]
[Authorize(Roles = "Employee,Admin")]
public class EmployeeQuotesController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly QuoteWorkflowService _quoteWorkflowService;

    public EmployeeQuotesController(AppDbContext dbContext, QuoteWorkflowService quoteWorkflowService)
    {
        _dbContext = dbContext;
        _quoteWorkflowService = quoteWorkflowService;
    }

    [HttpGet("queue")]
    public async Task<ActionResult<IEnumerable<QuoteDto>>> GetQueue([FromQuery] QuoteStatus? status)
    {
        var filterStatus = status ?? QuoteStatus.Submitted;

        var quotes = await _dbContext.Quotes
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .Where(q => q.Status == filterStatus)
            .ToListAsync();

        return Ok(quotes.Select(ToDto));
    }

    /// <summary>
    /// Every quote ever requested, in any status, newest first (MRV-1.2a). Filter by customer, status and request date
    /// (`from` inclusive, `to` exclusive, read as UTC); paged.
    /// </summary>
    [HttpGet("history")]
    public async Task<ActionResult<PagedResult<QuoteDto>>> GetHistory(
        [FromQuery] Guid? clientId,
        [FromQuery] QuoteStatus? status,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize)
    {
        var problem = Paging.Validate(page, pageSize) ?? DateRange.Validate(from, to)
            ?? (status.HasValue && !Enum.IsDefined(status.Value) ? "Unknown status." : null);
        if (problem is not null)
        {
            return BadRequest(problem);
        }

        var query = _dbContext.Quotes.AsQueryable();
        if (clientId.HasValue)
        {
            query = query.Where(q => q.ClientAccountId == clientId.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(q => q.Status == status.Value);
        }

        if (from.HasValue)
        {
            var start = DateRange.AsUtc(from.Value);
            query = query.Where(q => q.CreatedAt >= start);
        }

        if (to.HasValue)
        {
            var end = DateRange.AsUtc(to.Value);
            query = query.Where(q => q.CreatedAt < end);
        }

        var total = await query.CountAsync();
        var (size, skip) = Paging.Resolve(page, pageSize);
        var quotes = await query
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .OrderByDescending(q => q.CreatedAt).ThenBy(q => q.Id)
            .Skip(skip)
            .Take(size)
            .ToListAsync();

        return Ok(new PagedResult<QuoteDto>(quotes.Select(ToDto).ToList(), page, size, total));
    }

    [HttpPut("{id:guid}/price")]
    public async Task<ActionResult<QuoteDto>> PriceQuote(Guid id, PriceQuoteRequest request)
    {
        // Admins may price quotes without an employee account; the quote then records no pricing employee.
        if (!User.CanActAsStaff(out var employeeId))
        {
            return Forbid();
        }

        if (request.LineItems is null || request.LineItems.Count == 0)
        {
            return BadRequest("At least one line item price is required.");
        }

        var quote = await _dbContext.Quotes
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null)
        {
            return NotFound();
        }

        var finalPrices = request.LineItems.Select(li => (li.LineItemId, li.FinalUnitPrice));

        try
        {
            _quoteWorkflowService.PriceQuote(quote, employeeId, finalPrices);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        await _dbContext.SaveChangesAsync();

        return Ok(ToDto(quote));
    }

    private static QuoteDto ToDto(Quote quote) => new(
        quote.Id,
        quote.ClientAccountId,
        quote.Status,
        quote.CreatedAt,
        quote.PricedByEmployeeId,
        quote.LineItems.Select(li => new QuoteLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.SuggestedUnitPrice, li.FinalUnitPrice)).ToList());
}
