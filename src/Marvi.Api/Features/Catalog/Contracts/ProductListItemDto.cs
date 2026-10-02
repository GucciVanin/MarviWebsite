namespace Marvi.Api.Features.Catalog.Contracts;

public record ProductListItemDto(
    Guid Id,
    string Sku,
    string Name,
    string? ImageUrl,
    Dictionary<string, string> Attributes,
    decimal Price,
    string? DealName,
    bool InStock);
