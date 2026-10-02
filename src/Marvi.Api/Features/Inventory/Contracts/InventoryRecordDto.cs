namespace Marvi.Api.Features.Inventory.Contracts;

public record InventoryRecordDto(Guid Id, Guid ProductId, string ProductName, Guid WarehouseId, int QtyOnHand, int QtyReserved, int ReorderPoint);
