namespace Marvi.Api.Features.Catalog.Contracts;

/// <summary>
/// An edit of a product (<c>PUT /api/admin/products/{id}</c>): the whole product, checked by <c>ProductRules</c> like a new one (MRV-9.8).
/// Prices and stock have their own endpoints. Text fields are nullable so a missing one is answered as a field problem, not a bare 400.
/// </summary>
public record UpdateProductRequest(
    string? Sku,
    string? Name,
    string? Description,
    Guid? CategoryId,
    string? ImageUrl,
    bool IsActive,
    Dictionary<string, string>? Attributes);
