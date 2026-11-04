using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Orders;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Orders;

[ApiController]
[Route("api/orders")]
[Authorize(Roles = "Client")]
public class OrdersController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public OrdersController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet("mine")]
    public async Task<ActionResult<IEnumerable<OrderDto>>> GetMine()
    {
        var clientId = User.ClientId();
        if (clientId is null)
        {
            return Forbid();
        }

        var orders = await _dbContext.Orders
            .Include(o => o.ClientAccount)
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .Where(o => o.ClientAccountId == clientId)
            .ToListAsync();

        return Ok(orders.Select(ToDto));
    }

    private static OrderDto ToDto(Order order) => OrderDto.From(order);
}
