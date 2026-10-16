using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

[ApiController]
[Route("api/employee/clients")]
[Authorize(Roles = "Employee,Admin")]
public class EmployeeClientsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public EmployeeClientsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    /// <summary>
    /// The customer directory (MRV-2.4b.1): find customers by part of the company name (ignoring case), A to Z, paged.
    /// Without a search it lists everyone.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<ClientSummaryDto>>> Search(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize)
    {
        var problem = Paging.Validate(page, pageSize);
        if (problem is not null)
        {
            return BadRequest(problem);
        }

        var query = _dbContext.ClientAccounts.AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(c => c.CompanyName.ToLower().Contains(term));
        }

        var total = await query.CountAsync();
        var (size, skip) = Paging.Resolve(page, pageSize);
        var clients = await query
            .Include(c => c.PricingTier)
            .OrderBy(c => c.CompanyName.ToLower()).ThenBy(c => c.Id)
            .Skip(skip)
            .Take(size)
            .ToListAsync();

        var items = clients.Select(c => new ClientSummaryDto(c.Id, c.CompanyName, c.Status, c.PricingTierId, c.PricingTier?.Name, c.CreditLimit)).ToList();
        return Ok(new PagedResult<ClientSummaryDto>(items, page, size, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ClientProfileDto>> GetClient(Guid id)
    {
        var clientAccount = await _dbContext.ClientAccounts
            .Include(c => c.PricingTier)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (clientAccount is null)
        {
            return NotFound();
        }

        var quotes = await _dbContext.Quotes
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .Where(q => q.ClientAccountId == id)
            .ToListAsync();

        var orders = await _dbContext.Orders
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .Where(o => o.ClientAccountId == id)
            .ToListAsync();

        var dto = new ClientProfileDto(
            clientAccount.Id,
            clientAccount.CompanyName,
            clientAccount.BillingAddress,
            clientAccount.ShippingAddresses,
            clientAccount.CreditLimit,
            clientAccount.PricingTier?.Name,
            clientAccount.Status,
            quotes.Select(ToQuoteDto).ToList(),
            orders.Select(ToOrderDto).ToList());

        return Ok(dto);
    }

    private static QuoteDto ToQuoteDto(Quote quote) => new(
        quote.Id,
        quote.ClientAccountId,
        quote.Status,
        quote.CreatedAt,
        quote.PricedByEmployeeId,
        quote.LineItems.Select(li => new QuoteLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.SuggestedUnitPrice, li.FinalUnitPrice)).ToList());

    private static OrderDto ToOrderDto(Order order) => OrderDto.From(order);
}
