using Marvi.Api.Configuration;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Delivery;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    private readonly AuditLogger _auditLogger;
    private readonly ILogger<EmployeeOrdersController> _logger;

    public EmployeeOrdersController(AppDbContext dbContext, BasketPricingService basketPricing, PricingDataLoader pricingData, AuditLogger auditLogger, ILogger<EmployeeOrdersController> logger)
    {
        _dbContext = dbContext;
        _basketPricing = basketPricing;
        _pricingData = pricingData;
        _auditLogger = auditLogger;
        _logger = logger;
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

        // Where it is delivered (MRV-9.6): one of THIS customer's addresses (the chosen key, else their default). Staff do not invent an address; the
        // old free text is only still accepted for a customer who has no structured address at all.
        var legacyText = request.DeliveryAddress?.Trim();
        if (legacyText is not null && (legacyText.Length > Order.MaxDeliveryAddressLength || ClientAddressRules.HasForbiddenCharacters(legacyText)))
        {
            return BadRequest($"O endereço deve ter no máximo {Order.MaxDeliveryAddressLength} caracteres e não pode ter quebras de linha nem caracteres de controle.");
        }

        var hasStructuredAddress = await _dbContext.ClientAddresses.AnyAsync(a => a.ClientAccountId == clientAccount.Id);
        ClientAddress? delivery = null;
        if (request.DeliveryAddressKey is null && !hasStructuredAddress && !string.IsNullOrEmpty(legacyText))
        {
            _logger.LogWarning("Order for customer {CustomerNumber} placed with a free-text delivery address: the customer has no structured address (legacy fallback).", clientAccount.Number);
        }
        else if (request.DeliveryAddressKey is null && !string.IsNullOrEmpty(legacyText))
        {
            return BadRequest("Escolha um dos endereços de entrega cadastrados do cliente.");
        }
        else
        {
            var choice = await DeliveryAddressChoice.ResolveAsync(_dbContext, clientAccount.Id, request.DeliveryAddressKey);
            if (!choice.Succeeded)
            {
                return choice.Status == 404 ? NotFound() : BadRequest(choice.Message);
            }

            delivery = choice.Address;
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

        var lines = priced.Lines.Select(l => new OrderLineInput(l.ProductId, l.Qty, l.UnitPrice!.Value));
        var order = OrderFactory.Place(clientAccount.Id, lines, legacyText ?? string.Empty, placedByEmployeeId: employeeId, deliveryTo: SnapshotOf(delivery));

        _dbContext.Orders.Add(order);
        await _dbContext.SaveChangesAsync();

        var dto = await LoadOrderDtoAsync(order.Id);
        return Created(string.Empty, dto);
    }

    /// <summary>
    /// Staff amend the delivery address of an order that is not shipped yet (MRV-9.6): a Placed or Backordered order; a shipped or delivered
    /// (Fulfilled) or Cancelled one answers 409. The new address must be one of THAT customer's (else 404). The change and its audit entry (before and
    /// after) are written together.
    /// </summary>
    [HttpPut("{number:int}/delivery-address")]
    [EnableRateLimiting(RateLimiting.AddressesPolicy)]
    public async Task<ActionResult<OrderDto>> ChangeDeliveryAddress(int number, ChangeDeliveryAddressRequest request)
    {
        if (!User.CanActAsStaff(out _))
        {
            return Forbid();
        }

        var order = await _dbContext.Orders
            .Include(o => o.ClientAccount)
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .FirstOrDefaultAsync(o => o.Number == number);
        if (order is null)
        {
            return NotFound();
        }

        var choice = await DeliveryAddressChoice.ResolveAsync(_dbContext, order.ClientAccountId, request.DeliveryAddressKey);
        if (!choice.Succeeded)
        {
            return choice.Status == 404 ? NotFound() : BadRequest(choice.Message);
        }

        var before = new { Label = order.DeliveryAddressLabel, Address = order.DeliveryAddress };
        try
        {
            order.ChangeDeliveryAddress(choice.Address!);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }

        var saved = await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(Order), order.Id,
            new { Field = "DeliveryAddress", OrderNumber = order.Number, CustomerNumber = order.ClientAccount?.Number, Before = before, After = new { Label = order.DeliveryAddressLabel, Address = order.DeliveryAddress } });
        return saved ? Ok(ToDto(order)) : Conflict(AuditLogger.ConflictMessage);
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
            .Include(o => o.ClientAccount)
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .FirstAsync(o => o.Id == orderId);
        return ToDto(order);
    }

    private static OrderDto ToDto(Order order) => OrderDto.From(order);

    /// <summary>The address as a snapshot to copy onto the new order, or none for a legacy free-text order.</summary>
    private static IHasDeliveryAddress? SnapshotOf(ClientAddress? address)
    {
        if (address is null)
        {
            return null;
        }

        var snapshot = new Order();
        snapshot.CopyFrom(address);
        return snapshot;
    }
}
