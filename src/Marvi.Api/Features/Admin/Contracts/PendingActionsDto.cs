namespace Marvi.Api.Features.Admin.Contracts;

/// <summary>One kind of thing waiting on an admin: how many there are in all, and the first few (the ones waiting longest).</summary>
public record PendingGroup<T>(int Count, List<T> Items);

/// <summary>A customer waiting for an admin to approve or suspend them.</summary>
public record PendingCustomerDto(Guid Id, int CustomerNumber, string CompanyName, DateTime CreatedAt);

/// <summary>A quote nobody has priced yet.</summary>
public record PendingQuoteDto(Guid Id, int Number, Guid ClientAccountId, int CustomerNumber, string CompanyName, DateTime CreatedAt, int LineCount);

/// <summary>A stock record at or below its reorder point.</summary>
public record LowStockDto(Guid ProductId, string Sku, string ProductName, Guid WarehouseId, string WarehouseName, int Available, int ReorderPoint);

/// <summary>A product that needs attention: an active product with no price a visitor can see ("Sob consulta"), or with no stock record at all.</summary>
public record ProductRefDto(Guid ProductId, string Sku, string Name);

/// <summary>A contact-form message nobody has handled yet (MRV-2.8). The text is a visitor's, shown as plain text.</summary>
public record PendingContactMessageDto(Guid Id, string Name, string Email, string? Phone, string? Company, string Message, DateTime CreatedAt);

/// <summary>Everything that is waiting on an admin (MRV-6.2): the admin portal's inbox. `Total` is the sum of the counts.</summary>
public record PendingActionsDto(
    int Total,
    PendingGroup<PendingCustomerDto> Customers,
    PendingGroup<PendingQuoteDto> Quotes,
    PendingGroup<LowStockDto> LowStock,
    PendingGroup<ProductRefDto> UnpricedProducts,
    PendingGroup<ProductRefDto> UnstockedProducts,
    PendingGroup<PendingContactMessageDto> ContactMessages);
