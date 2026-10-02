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

    private static OrderDto ToOrderDto(Order order) => new(
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
