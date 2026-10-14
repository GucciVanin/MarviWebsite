namespace Marvi.Api.Features.Catalog.Contracts;

/// <summary>The public numbers behind the landing page. Counts only: no prices, no customers, nothing per item.</summary>
public record PublicStatsDto(int ProductCount, int CategoryCount, int CoverageAreaCount);
