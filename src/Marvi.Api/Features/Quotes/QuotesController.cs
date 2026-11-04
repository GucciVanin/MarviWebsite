using Marvi.Api.Configuration;
using Marvi.Api.Features.Catalog;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
        var clientId = User.ClientId();
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

        // Where it is delivered (MRV-9.6): the chosen address of THIS customer, else their default delivery address.
        var delivery = await DeliveryAddressChoice.ResolveAsync(_dbContext, clientAccount.Id, request.DeliveryAddressKey);
        if (!delivery.Succeeded)
        {
            return delivery.Status == 404 ? NotFound() : BadRequest(delivery.Message);
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

        var quote = _quoteWorkflowService.CreateQuote(clientAccount.Id, lineItems, delivery.Address);

        _dbContext.Quotes.Add(quote);
        await _dbContext.SaveChangesAsync();

        var dto = await LoadQuoteDtoAsync(quote.Id);
        return Created(string.Empty, dto);
    }

    /// <summary>
    /// The customer picks another delivery address for their own quote while it is Submitted or Priced (MRV-9.6); after that 409. Someone else's quote
    /// and an address that is not the customer's answer 404. The quote keeps a copy of the address, not a reference to its current state.
    /// </summary>
    [HttpPut("{number:int}/delivery-address")]
    [EnableRateLimiting(RateLimiting.AddressesPolicy)]
    public async Task<ActionResult<QuoteDto>> ChangeDeliveryAddress(int number, ChangeDeliveryAddressRequest request)
    {
        var clientId = User.ClientId();
        if (clientId is null)
        {
            return Forbid();
        }

        var quote = await _dbContext.Quotes
            .Include(q => q.ClientAccount)
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .FirstOrDefaultAsync(q => q.Number == number && q.ClientAccountId == clientId.Value);
        if (quote is null)
        {
            return NotFound();
        }

        // Like creating and accepting a quote, re-addressing one is for an eligible (Approved) customer.
        var accountStatus = await _dbContext.ClientAccounts.Where(c => c.Id == clientId.Value).Select(c => c.Status).FirstOrDefaultAsync();
        if (!CustomerEligibility.IsEligible(accountStatus))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Client account is not active.");
        }

        var delivery = await DeliveryAddressChoice.ResolveAsync(_dbContext, clientId.Value, request.DeliveryAddressKey);
        if (!delivery.Succeeded)
        {
            return delivery.Status == 404 ? NotFound() : BadRequest(delivery.Message);
        }

        try
        {
            _quoteWorkflowService.ChangeDeliveryAddress(quote, delivery.Address!);
            await _dbContext.SaveChangesAsync();
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }
        catch (DbUpdateConcurrencyException)
        {
            // The quote was accepted or rejected between reading it and saving: its address is no longer changeable.
            return Conflict("The quote was just changed. Reload and try again.");
        }

        return Ok(ToDto(quote));
    }

    [HttpGet("mine")]
    public async Task<ActionResult<IEnumerable<QuoteDto>>> GetMine()
    {
        var clientId = User.ClientId();
        if (clientId is null)
        {
            return Forbid();
        }

        var quotes = await _dbContext.Quotes
            .Include(q => q.ClientAccount)
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .Where(q => q.ClientAccountId == clientId.Value)
            .ToListAsync();

        return Ok(quotes.Select(ToDto));
    }

    [HttpPost("{id:guid}/accept")]
    public async Task<ActionResult<OrderDto>> Accept(Guid id)
    {
        var clientId = User.ClientId();
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
        catch (QuoteWithoutDeliveryAddressException ex)
        {
            return Conflict(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        // Quote status flip and Order/OrderLineItem inserts persist together in this single SaveChangesAsync call.
        _dbContext.Orders.Add(order);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            // The quote's status or address was changed by someone else (a second accept, a change of address) after it was read: no order is created.
            return Conflict("The quote was just changed. Reload and try again.");
        }

        var dto = await LoadOrderDtoAsync(order.Id);
        return Created(string.Empty, dto);
    }

    /// <summary>A customer turns down a priced quote. Unlike accepting, this is allowed for a suspended account: it creates nothing.</summary>
    [HttpPost("{id:guid}/reject")]
    public async Task<ActionResult<QuoteDto>> Reject(Guid id)
    {
        var clientId = User.ClientId();
        if (clientId is null)
        {
            return Forbid();
        }

        var quote = await _dbContext.Quotes
            .Include(q => q.ClientAccount)
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .FirstOrDefaultAsync(q => q.Id == id);
        if (quote is null)
        {
            return NotFound();
        }

        if (quote.ClientAccountId != clientId.Value)
        {
            return Forbid();
        }

        try
        {
            _quoteWorkflowService.RejectQuote(quote);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict("The quote was just changed. Reload and try again.");
        }

        return Ok(ToDto(quote));
    }

    private async Task<QuoteDto> LoadQuoteDtoAsync(Guid quoteId)
    {
        var quote = await _dbContext.Quotes
            .Include(q => q.ClientAccount)
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .FirstAsync(q => q.Id == quoteId);
        return ToDto(quote);
    }

    private async Task<OrderDto> LoadOrderDtoAsync(Guid orderId)
    {
        var order = await _dbContext.Orders
            .Include(o => o.ClientAccount)
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .FirstAsync(o => o.Id == orderId);
        return ToDto(order);
    }

    private static QuoteDto ToDto(Quote quote) => QuoteDto.From(quote);

    private static OrderDto ToDto(Order order) => OrderDto.From(order);
}
