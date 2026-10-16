using Marvi.Api.Features.Catalog;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Orders;

[ApiController]
[Route("api/employee/orders")]
[Authorize(Roles = "Employee,Admin")]
public class EmployeeOrdersController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly BasketPricingService _basketPricing;
    private readonly PricingDataLoader _pricingData;

    public EmployeeOrdersController(AppDbContext dbContext, BasketPricingService basketPricing, PricingDataLoader pricingData)
    {
        _dbContext = dbContext;
        _basketPricing = basketPricing;
        _pricingData = pricingData;
    }

    [HttpPost]
    public async Task<ActionResult<OrderDto>> CreateOrder(CreateEmployeeOrderRequest request)
    {
        // Admins may place orders without an employee account; the order then records no placing employee.
        if (!User.CanActAsStaff(out var employeeId))
        {
            return Forbid();
        }

        var requested = request.LineItems?.Select(li => new BasketLine(li.ProductId, li.Qty)).ToList();
        if (_basketPricing.Validate(requested) is not null)
        {
            return BadRequest("An order needs at least one line item, each with a quantity of at least 1.");
        }

        if (string.IsNullOrWhiteSpace(request.DeliveryAddress))
        {
            return BadRequest("Delivery address is required.");
        }

        var clientAccount = await _dbContext.ClientAccounts
            .Include(c => c.PricingTier)
            .FirstOrDefaultAsync(c => c.Id == request.ClientId);
        if (clientAccount is null)
        {
            return BadRequest("Client not found.");
        }

        if (!CustomerEligibility.IsEligible(clientAccount.Status))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Client account is not approved.");
        }

        var data = await _pricingData.LoadAsync(clientAccount.PricingTier, requested!.Select(l => l.ProductId).ToList());
        var priced = _basketPricing.Price(requested!, data);
        if (priced.Problem == BasketProblem.NoPricingTier)
        {
            return BadRequest("No pricing tier configured for this account.");
        }

        // The first problem in line order is the one reported.
        foreach (var line in priced.Lines)
        {
            if (line.Product is null)
            {
                return BadRequest($"Product '{line.ProductId}' not found.");
            }

            if (line.UnitPrice is null)
            {
                // Never sell at an implicit price of 0: the product has no price for this client's tier.
                return BadRequest($"Product '{line.Product.Sku}' has no price configured for pricing tier '{clientAccount.PricingTier!.Name}'.");
            }
        }

        var order = OrderFactory.Place(
            clientAccount.Id,
            priced.Lines.Select(l => new OrderLineInput(l.ProductId, l.Qty, l.UnitPrice!.Value)),
            request.DeliveryAddress,
            placedByEmployeeId: employeeId);

        _dbContext.Orders.Add(order);
        await _dbContext.SaveChangesAsync();

        var dto = await LoadOrderDtoAsync(order.Id);
        return Created(string.Empty, dto);
    }

    /// <summary>
    /// Every order ever placed, in any status, newest first (MRV-1.2b). Filter by customer, status and placement date
    /// (`from` inclusive, `to` exclusive, read as UTC); paged.
    /// </summary>
    [HttpGet("history")]
    public async Task<ActionResult<PagedResult<OrderHistoryItemDto>>> GetHistory(
        [FromQuery] Guid? clientId,
        [FromQuery] OrderStatus? status,
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

        var query = _dbContext.Orders.AsQueryable();
        if (clientId.HasValue)
        {
            query = query.Where(o => o.ClientAccountId == clientId.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(o => o.Status == status.Value);
        }

        if (from.HasValue)
        {
            var start = DateRange.AsUtc(from.Value);
            query = query.Where(o => o.PlacedAt >= start);
        }

        if (to.HasValue)
        {
            var end = DateRange.AsUtc(to.Value);
            query = query.Where(o => o.PlacedAt < end);
        }

        var total = await query.CountAsync();
        var (size, skip) = Paging.Resolve(page, pageSize);
        var orders = await query
            .Include(o => o.ClientAccount)
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .OrderByDescending(o => o.PlacedAt).ThenBy(o => o.Id)
            .Skip(skip)
            .Take(size)
            .ToListAsync();

        return Ok(new PagedResult<OrderHistoryItemDto>(orders.Select(OrderHistoryItemDto.From).ToList(), page, size, total));
    }

    private async Task<OrderDto> LoadOrderDtoAsync(Guid orderId)
    {
        var order = await _dbContext.Orders
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .FirstAsync(o => o.Id == orderId);
        return ToDto(order);
    }

    private static OrderDto ToDto(Order order) => OrderDto.From(order);
}
