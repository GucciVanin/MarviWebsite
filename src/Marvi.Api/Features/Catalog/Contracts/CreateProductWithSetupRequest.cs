namespace Marvi.Api.Features.Catalog.Contracts;

/// <summary>
/// The guided "Novo produto" form (MRV-9.5): the product, a price per pricing tier and an opening quantity per warehouse, saved together.
/// A row with no price (or no quantity) is skipped; the rows keep the order of the form, so a problem named <c>prices[2]</c> is the third row.
/// </summary>
public record CreateProductWithSetupRequest(
    string? Sku,
    string? Name,
    string? Description,
    Guid? CategoryId,
    string? ImageUrl,
    bool IsActive,
    Dictionary<string, string>? Attributes,
    List<ProductSetupPriceRequest>? Prices,
    List<ProductSetupStockRequest>? Stock);

public record ProductSetupPriceRequest(Guid PricingTierId, decimal? UnitPrice);

public record ProductSetupStockRequest(Guid WarehouseId, int? QtyOnHand);
