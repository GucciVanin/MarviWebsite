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
            return BadRequest(error);
        }

        var warehouse = new Warehouse
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Address = request.Address.Trim(),
            Latitude = request.Latitude,
            Longitude = request.Longitude
        };

        _dbContext.Warehouses.Add(warehouse);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Create", nameof(Warehouse), warehouse.Id, request);

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
            return BadRequest(error);
        }

        warehouse.Name = request.Name.Trim();
        warehouse.Address = request.Address.Trim();
        warehouse.Latitude = request.Latitude;
        warehouse.Longitude = request.Longitude;
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Update", nameof(Warehouse), id, request);

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
        if (await _dbContext.InventoryRecords.AnyAsync(i => i.WarehouseId == id) || await _dbContext.Orders.AnyAsync(o => o.WarehouseId == id))
        {
            return Conflict("The warehouse still has inventory or orders. Clear its stock first; warehouses with order history cannot be deleted.");
        }

        _dbContext.Warehouses.Remove(warehouse);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsConstraintViolation())
        {
            // Stock or an order appeared between the check above and the delete.
            return Conflict("The warehouse still has inventory or orders.");
        }

        await _auditLogger.LogAsync("Delete", nameof(Warehouse), id);

        return NoContent();
    }

    private static string? Validate(UpsertWarehouseRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Address))
        {
            return "Name and address are required.";
        }

        if (!double.IsFinite(request.Latitude) || request.Latitude is < -90 or > 90)
        {
            return "Latitude must be between -90 and 90.";
        }

        if (!double.IsFinite(request.Longitude) || request.Longitude is < -180 or > 180)
        {
            return "Longitude must be between -180 and 180.";
        }

        return null;
    }

    private static WarehouseDto ToDto(Warehouse warehouse) =>
        new(warehouse.Id, warehouse.Name, warehouse.Address, warehouse.Latitude, warehouse.Longitude);
}
