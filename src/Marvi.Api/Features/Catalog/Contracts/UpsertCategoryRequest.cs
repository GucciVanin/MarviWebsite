namespace Marvi.Api.Features.Catalog.Contracts;

public record UpsertCategoryRequest(string Name, int SortOrder, bool IsActive);
