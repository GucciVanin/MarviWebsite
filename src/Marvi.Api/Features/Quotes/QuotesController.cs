using Marvi.Api.Features.Catalog;
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
    private readonly BasketPricingService _basketPricing;
    private readonly PricingDataLoader _pricingData;
    private readonly QuoteWorkflowService _quoteWorkflowService;

    public QuotesController(AppDbContext dbContext, BasketPricingService basketPricing, PricingDataLoader pricingData, QuoteWorkflowService quoteWorkflowService)
    {
        _dbContext = dbContext;
        _basketPricing = basketPricing;
        _pricingData = pricingData;
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

        var requested = request.LineItems?.Select(li => new BasketLine(li.ProductId, li.Qty)).ToList();
        if (_basketPricing.Validate(requested) is not null)
        {
            return BadRequest("A quote needs at least one line item, each with a quantity of at least 1.");
        }

        var clientAccount = await _dbContext.ClientAccounts
            .Include(c => c.PricingTier)
            .FirstOrDefaultAsync(c => c.Id == clientId.Value);
        if (clientAccount is null || !CustomerEligibility.IsEligible(clientAccount.Status))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Client account is not active.");
        }

        var data = await _pricingData.LoadAsync(clientAccount.PricingTier, requested!.Select(l => l.ProductId).ToList());
        var priced = _basketPricing.Price(requested!, data);
        if (priced.Problem == BasketProblem.NoPricingTier)
        {
            return BadRequest("No pricing tier configured for this account.");
        }

        var unknown = priced.Lines.FirstOrDefault(l => l.Product is null);
        if (unknown is not null)
        {
            return BadRequest($"Product '{unknown.ProductId}' not found.");
        }

        // An unpriced line keeps an empty suggestion for an employee to price.
        var lineItems = priced.Lines.Select(line => new QuoteLineItem
        {
            Id = Guid.NewGuid(),
            ProductId = line.ProductId,
            Qty = line.Qty,
            SuggestedUnitPrice = line.UnitPrice
        }).ToList();

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
        if (!CustomerEligibility.IsEligible(accountStatus))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Client account is not active.");
        }

        Order order;
        try
        {
            order = _quoteWorkflowService.AcceptQuote(quote);
        }
        catch (QuoteNotFullyPricedException ex)
        {
            return Conflict(ex.Message);
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
