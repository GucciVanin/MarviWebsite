namespace Marvi.Api.Features.Catalog.Contracts;

/// <summary>Public view: active categories only, with the number of active products inside.</summary>
public record CategoryDto(Guid Id, string Name, int ProductCount);
