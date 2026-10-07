namespace Marvi.Api.Features.Catalog.Contracts;

public record ProductDetailDto(
    Guid Id,
    string Sku,
    string Name,
    string? Description,
    string? ImageUrl,
    Dictionary<string, string> Attributes,
    decimal? Price,
    string? DealName,
    bool InStock);
