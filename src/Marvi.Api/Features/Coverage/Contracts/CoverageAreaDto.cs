using Marvi.Domain.Coverage;

namespace Marvi.Api.Features.Coverage.Contracts;

public record CoverageAreaDto(Guid Id, Guid WarehouseId, CoverageAreaType Type, double? RadiusMiles, string? PolygonGeoJson);
