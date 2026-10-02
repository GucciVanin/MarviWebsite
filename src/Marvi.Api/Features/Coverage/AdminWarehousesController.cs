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
        var warehouse = new Warehouse
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Address = request.Address,
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

        warehouse.Name = request.Name;
        warehouse.Address = request.Address;
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

        _dbContext.Warehouses.Remove(warehouse);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Delete", nameof(Warehouse), id);

        return NoContent();
    }

    private static WarehouseDto ToDto(Warehouse warehouse) =>
        new(warehouse.Id, warehouse.Name, warehouse.Address, warehouse.Latitude, warehouse.Longitude);
}
