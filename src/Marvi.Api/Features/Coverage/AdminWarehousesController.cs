using Marvi.Api.Features.Admin;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Coverage.Contracts;
using Marvi.Domain.Coverage;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Coverage;

[ApiController]
[Route("api/admin/warehouses")]
[Authorize(Roles = "Admin")]
public class AdminWarehousesController : ControllerBase
{
    private const string InUseMessage = "The warehouse still has inventory or orders. Clear its stock first; warehouses with order history cannot be deleted.";
    // Stock or an order appeared between the guard and the delete.
    private const string DeleteRaceMessage = "The warehouse still has inventory or orders.";

    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminWarehousesController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<WarehouseDto>>> GetWarehouses()
    {
        var warehouses = await _dbContext.Warehouses.ToListAsync();
        return Ok(warehouses.Select(ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<WarehouseDto>> GetWarehouse(Guid id)
    {
        var warehouse = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.Id == id);
        if (warehouse is null)
        {
            return NotFound();
        }

        return Ok(ToDto(warehouse));
    }

    [HttpPost]
    public async Task<ActionResult<WarehouseDto>> CreateWarehouse(UpsertWarehouseRequest request)
    {
        var error = Validate(request);
        if (error is not null)
        {
            return error.ToResult(this);
        }

        var warehouse = new Warehouse
        {
            Id = Guid.NewGuid(),
            Name = AdminInput.Clean(request.Name),
            Address = AdminInput.Clean(request.Address),
            Latitude = request.Latitude,
            Longitude = request.Longitude
        };

        _dbContext.Warehouses.Add(warehouse);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Create, nameof(Warehouse), warehouse.Id, request))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return CreatedAtAction(nameof(GetWarehouse), new { id = warehouse.Id }, ToDto(warehouse));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateWarehouse(Guid id, UpsertWarehouseRequest request)
    {
        var warehouse = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.Id == id);
        if (warehouse is null)
        {
            return NotFound();
        }

        var error = Validate(request);
        if (error is not null)
        {
            return error.ToResult(this);
        }

        warehouse.Name = AdminInput.Clean(request.Name);
        warehouse.Address = AdminInput.Clean(request.Address);
        warehouse.Latitude = request.Latitude;
        warehouse.Longitude = request.Longitude;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(Warehouse), id, request))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteWarehouse(Guid id)
    {
        var warehouse = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.Id == id);
        if (warehouse is null)
        {
            return NotFound();
        }

        // Stock and order history point at the warehouse; deleting it would erase them (inventory) or be refused by
        // the database (orders). Coverage areas belong to the warehouse and go with it.
        var blocked = await DeleteGuards.BlockingMessageAsync(new DeleteGuard(
            async () => await _dbContext.InventoryRecords.AnyAsync(i => i.WarehouseId == id) || await _dbContext.Orders.AnyAsync(o => o.WarehouseId == id),
            InUseMessage));
        if (blocked is not null)
        {
            return Conflict(blocked);
        }

        _dbContext.Warehouses.Remove(warehouse);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Delete, nameof(Warehouse), id))
        {
            // Stock or an order appeared between the check above and the delete.
            return Conflict(DeleteRaceMessage);
        }

        return NoContent();
    }

    private static InputProblem? Validate(UpsertWarehouseRequest request)
    {
        if (AdminInput.IsBlank(request.Name) || AdminInput.IsBlank(request.Address))
        {
            return InputProblem.BadRequest("Name and address are required.");
        }

        if (!double.IsFinite(request.Latitude) || request.Latitude is < -90 or > 90)
        {
            return InputProblem.BadRequest("Latitude must be between -90 and 90.");
        }

        if (!double.IsFinite(request.Longitude) || request.Longitude is < -180 or > 180)
        {
            return InputProblem.BadRequest("Longitude must be between -180 and 180.");
        }

        return null;
    }

    private static WarehouseDto ToDto(Warehouse warehouse) =>
        new(warehouse.Id, warehouse.Name, warehouse.Address, warehouse.Latitude, warehouse.Longitude);
}
