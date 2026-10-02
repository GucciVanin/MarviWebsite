using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Quotes;

[ApiController]
[Route("api/quotes")]
[Authorize(Roles = "Client")]
public class QuotesController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly PricingService _pricingService;
    private readonly QuoteWorkflowService _quoteWorkflowService;

    public QuotesController(AppDbContext dbContext, PricingService pricingService, QuoteWorkflowService quoteWorkflowService)
    {
        _dbContext = dbContext;
        _pricingService = pricingService;
        _quoteWorkflowService = quoteWorkflowService;
    }

    [HttpPost]
    public async Task<ActionResult<QuoteDto>> CreateQuote(CreateQuoteRequest request)
    {
        var clientId = GetClientId();
        if (clientId is null)
        {
            return Forbid();
        }

        if (request.LineItems is null || request.LineItems.Count == 0 || request.LineItems.Any(li => li.Qty < 1))
        {
            return BadRequest("A quote needs at least one line item, each with a quantity of at least 1.");
        }

        var clientAccount = await _dbContext.ClientAccounts
            .Include(c => c.PricingTier)
            .FirstOrDefaultAsync(c => c.Id == clientId.Value);
        if (clientAccount is null || clientAccount.Status == ClientAccountStatus.Suspended)
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Client account is not active.");
        }

        if (clientAccount.PricingTier is null)
        {
            return BadRequest("No pricing tier configured for this account.");
        }

        var productIds = request.LineItems.Select(li => li.ProductId).ToList();
        var products = await _dbContext.Products.Where(p => productIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var pricingRows = await _dbContext.ProductPricings.Where(pp => pp.PricingTierId == clientAccount.PricingTier.Id).ToListAsync();
        var now = DateTime.UtcNow;
        var activeDeals = await _dbContext.Deals.Where(d => d.StartDate <= now && d.EndDate >= now).ToListAsync();

        var lineItems = new List<QuoteLineItem>();
        foreach (var line in request.LineItems)
        {
            if (!products.TryGetValue(line.ProductId, out var product))
            {
                return BadRequest($"Product '{line.ProductId}' not found.");
            }

            decimal? suggestedPrice;
            try
            {
                suggestedPrice = _pricingService.ResolvePrice(product, clientAccount.PricingTier, pricingRows, activeDeals, line.Qty).UnitPrice;
            }
            catch (InvalidOperationException)
            {
                // No pricing row configured for this product/tier combination.
                suggestedPrice = null;
            }

            lineItems.Add(new QuoteLineItem
            {
                Id = Guid.NewGuid(),
                ProductId = line.ProductId,
                Qty = line.Qty,
                SuggestedUnitPrice = suggestedPrice
            });
        }

        var quote = _quoteWorkflowService.CreateQuote(clientAccount.Id, lineItems);

        _dbContext.Quotes.Add(quote);
        await _dbContext.SaveChangesAsync();

        var dto = await LoadQuoteDtoAsync(quote.Id);
        return Created(string.Empty, dto);
    }

    [HttpGet("mine")]
    public async Task<ActionResult<IEnumerable<QuoteDto>>> GetMine()
    {
        var clientId = GetClientId();
        if (clientId is null)
        {
            return Forbid();
        }

        var quotes = await _dbContext.Quotes
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .Where(q => q.ClientAccountId == clientId.Value)
            .ToListAsync();

        return Ok(quotes.Select(ToDto));
    }

    [HttpPost("{id:guid}/accept")]
    public async Task<ActionResult<OrderDto>> Accept(Guid id)
    {
        var clientId = GetClientId();
        if (clientId is null)
        {
            return Forbid();
        }

        var quote = await _dbContext.Quotes
            .Include(q => q.LineItems)
            .FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null)
        {
            return NotFound();
        }

        if (quote.ClientAccountId != clientId.Value)
        {
            return Forbid();
        }

        var accountStatus = await _dbContext.ClientAccounts
            .Where(c => c.Id == clientId.Value)
            .Select(c => c.Status)
            .FirstOrDefaultAsync();
        if (accountStatus == ClientAccountStatus.Suspended)
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Client account is not active.");
        }

        Order order;
        try
        {
            order = _quoteWorkflowService.AcceptQuote(quote);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        // Quote status flip and Order/OrderLineItem inserts persist together in this single SaveChangesAsync call.
        _dbContext.Orders.Add(order);
        await _dbContext.SaveChangesAsync();

        var dto = await LoadOrderDtoAsync(order.Id);
        return Created(string.Empty, dto);
    }

    private Guid? GetClientId()
    {
        var claim = User.FindFirst("client_id")?.Value;
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private async Task<QuoteDto> LoadQuoteDtoAsync(Guid quoteId)
    {
        var quote = await _dbContext.Quotes
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .FirstAsync(q => q.Id == quoteId);
        return ToDto(quote);
    }

    private async Task<OrderDto> LoadOrderDtoAsync(Guid orderId)
    {
        var order = await _dbContext.Orders
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .FirstAsync(o => o.Id == orderId);
        return ToDto(order);
    }

    private static QuoteDto ToDto(Quote quote) => new(
        quote.Id,
        quote.ClientAccountId,
        quote.Status,
        quote.CreatedAt,
        quote.PricedByEmployeeId,
        quote.LineItems.Select(li => new QuoteLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.SuggestedUnitPrice, li.FinalUnitPrice)).ToList());

    private static OrderDto ToDto(Order order) => new(
        order.Id,
        order.ClientAccountId,
        order.QuoteId,
        order.Status,
        order.DeliveryAddress,
        order.WarehouseId,
        order.PlacedByEmployeeId,
        order.TotalAmount,
        order.LineItems.Select(li => new OrderLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.UnitPrice)).ToList());
}
