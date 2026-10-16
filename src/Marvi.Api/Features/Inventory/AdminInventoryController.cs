using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Inventory.Contracts;
using Marvi.Domain.Inventory;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Inventory;

[ApiController]
[Route("api/admin/inventory")]
[Authorize(Roles = "Admin")]
public class AdminInventoryController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminInventoryController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    /// <summary>Sets on-hand stock and reorder point for a product at a warehouse, creating the record if needed. Reserved quantity is untouched.</summary>
    [HttpPut]
    public async Task<ActionResult<InventoryRecordDto>> Upsert(UpsertInventoryRequest request)
    {
        if (request.QtyOnHand < 0 || request.ReorderPoint < 0)
        {
            return BadRequest("Quantities cannot be negative.");
        }

        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == request.ProductId);
        if (product is null)
        {
            return BadRequest("Product not found.");
        }

        var warehouse = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.Id == request.WarehouseId);
        if (warehouse is null)
        {
            return BadRequest("Warehouse not found.");
        }

        var record = await _dbContext.InventoryRecords
            .FirstOrDefaultAsync(i => i.ProductId == request.ProductId && i.WarehouseId == request.WarehouseId);
        if (record is null)
        {
            record = new InventoryRecord
            {
                Id = Guid.NewGuid(),
                ProductId = request.ProductId,
                WarehouseId = request.WarehouseId
            };
            _dbContext.InventoryRecords.Add(record);
        }

        record.QtyOnHand = request.QtyOnHand;
        record.ReorderPoint = request.ReorderPoint;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Upsert, nameof(InventoryRecord), record.Id, request))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return Ok(new InventoryRecordDto(record.Id, record.ProductId, product.Name, record.WarehouseId, warehouse.Name, record.QtyOnHand, record.QtyReserved, record.ReorderPoint));
    }
}
