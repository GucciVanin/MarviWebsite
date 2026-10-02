namespace Marvi.Api.Features.Catalog.Contracts;

public record UpsertProductRequest(
    string Sku,
    string Name,
    string? Description,
    Guid? CategoryId,
    string? ImageUrl,
    bool IsActive,
    Dictionary<string, string> Attributes);
