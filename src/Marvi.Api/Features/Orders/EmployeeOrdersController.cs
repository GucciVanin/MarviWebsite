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
    private readonly PricingService _pricingService;

    public EmployeeOrdersController(AppDbContext dbContext, PricingService pricingService)
    {
        _dbContext = dbContext;
        _pricingService = pricingService;
    }

    [HttpPost]
    public async Task<ActionResult<OrderDto>> CreateOrder(CreateEmployeeOrderRequest request)
    {
        // Admins may place orders without an employee account; the order then records no placing employee.
        var employeeId = Guid.TryParse(User.FindFirst("employee_id")?.Value, out var parsedId) ? parsedId : (Guid?)null;
        if (employeeId is null && !User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request.LineItems is null || request.LineItems.Count == 0 || request.LineItems.Any(li => li.Qty < 1))
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

        if (clientAccount.Status != ClientAccountStatus.Approved)
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Client account is not approved.");
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

        var lineItems = new List<OrderLineItem>();
        foreach (var line in request.LineItems)
        {
            if (!products.TryGetValue(line.ProductId, out var product))
            {
                return BadRequest($"Product '{line.ProductId}' not found.");
            }

            decimal unitPrice;
            try
            {
                unitPrice = _pricingService.ResolvePrice(product, clientAccount.PricingTier, pricingRows, activeDeals, line.Qty).UnitPrice;
            }
            catch (InvalidOperationException)
            {
                // Never sell at an implicit price of 0: the product has no price for this client's tier.
                return BadRequest($"Product '{product.Sku}' has no price configured for pricing tier '{clientAccount.PricingTier.Name}'.");
            }

            lineItems.Add(new OrderLineItem
            {
                Id = Guid.NewGuid(),
                ProductId = line.ProductId,
                Qty = line.Qty,
                UnitPrice = unitPrice
            });
        }

        var order = new Order
        {
            Id = Guid.NewGuid(),
            ClientAccountId = clientAccount.Id,
            Status = OrderStatus.Placed,
            DeliveryAddress = request.DeliveryAddress,
            PlacedByEmployeeId = employeeId,
            TotalAmount = lineItems.Sum(li => li.UnitPrice * li.Qty),
            LineItems = lineItems
        };

        foreach (var lineItem in order.LineItems)
        {
            lineItem.OrderId = order.Id;
        }

        _dbContext.Orders.Add(order);
        await _dbContext.SaveChangesAsync();

        var dto = await LoadOrderDtoAsync(order.Id);
        return Created(string.Empty, dto);
    }

    private async Task<OrderDto> LoadOrderDtoAsync(Guid orderId)
    {
        var order = await _dbContext.Orders
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .FirstAsync(o => o.Id == orderId);
        return ToDto(order);
    }

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
