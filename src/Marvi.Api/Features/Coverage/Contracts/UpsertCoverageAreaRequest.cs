using Marvi.Domain.Coverage;

namespace Marvi.Api.Features.Coverage.Contracts;

public record UpsertCoverageAreaRequest(Guid WarehouseId, CoverageAreaType Type, double? RadiusMiles, string? PolygonGeoJson);
