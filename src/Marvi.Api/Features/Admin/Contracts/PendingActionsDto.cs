namespace Marvi.Api.Features.Admin.Contracts;

/// <summary>One kind of thing waiting on an admin: how many there are in all, and the first few (the ones waiting longest).</summary>
public record PendingGroup<T>(int Count, List<T> Items);

/// <summary>A customer waiting for an admin to approve or suspend them.</summary>
public record PendingCustomerDto(Guid Id, string CompanyName, DateTime CreatedAt);

/// <summary>A quote nobody has priced yet.</summary>
public record PendingQuoteDto(Guid Id, Guid ClientAccountId, string CompanyName, DateTime CreatedAt, int LineCount);

/// <summary>A stock record at or below its reorder point.</summary>
public record LowStockDto(Guid ProductId, string Sku, string ProductName, Guid WarehouseId, string WarehouseName, int Available, int ReorderPoint);

/// <summary>An active product with no price in the default tier: visitors see "Sob consulta" for it.</summary>
public record UnpricedProductDto(Guid ProductId, string Sku, string Name);

/// <summary>Everything that is waiting on an admin (MRV-6.2): the admin portal's inbox. `Total` is the sum of the counts.</summary>
public record PendingActionsDto(
    int Total,
    PendingGroup<PendingCustomerDto> Customers,
    PendingGroup<PendingQuoteDto> Quotes,
    PendingGroup<LowStockDto> LowStock,
    PendingGroup<UnpricedProductDto> UnpricedProducts);
