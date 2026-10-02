namespace Marvi.Api.Features.Inventory.Contracts;

public record UpsertInventoryRequest(Guid ProductId, Guid WarehouseId, int QtyOnHand, int ReorderPoint);
