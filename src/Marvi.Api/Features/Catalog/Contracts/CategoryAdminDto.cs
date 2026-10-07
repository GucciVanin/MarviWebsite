namespace Marvi.Api.Features.Catalog.Contracts;

public record CategoryAdminDto(Guid Id, string Name, int SortOrder, bool IsActive, int ProductCount);
