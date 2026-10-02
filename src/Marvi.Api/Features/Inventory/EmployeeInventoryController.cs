using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Inventory;

[ApiController]
[Route("api/employee/inventory")]
[Authorize(Roles = "Employee,Admin")]
public class EmployeeInventoryController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public EmployeeInventoryController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<InventoryRecordDto>>> GetInventory([FromQuery] Guid? warehouseId)
    {
        var query = _dbContext.InventoryRecords.Include(i => i.Product).AsQueryable();
        if (warehouseId.HasValue)
        {
            query = query.Where(i => i.WarehouseId == warehouseId.Value);
        }

        var records = await query.ToListAsync();

        var result = records.Select(i => new InventoryRecordDto(
            i.Id,
            i.ProductId,
            i.Product?.Name ?? string.Empty,
            i.WarehouseId,
            i.QtyOnHand,
            i.QtyReserved,
            i.ReorderPoint));

        return Ok(result);
    }
}
