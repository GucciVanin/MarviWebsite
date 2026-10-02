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

    [HttpPut("{id:guid}/price")]
    public async Task<ActionResult<QuoteDto>> PriceQuote(Guid id, PriceQuoteRequest request)
    {
        // Admins may price quotes without an employee account; the quote then records no pricing employee.
        var employeeId = Guid.TryParse(User.FindFirst("employee_id")?.Value, out var parsedId) ? parsedId : (Guid?)null;
        if (employeeId is null && !User.IsInRole("Admin"))
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
