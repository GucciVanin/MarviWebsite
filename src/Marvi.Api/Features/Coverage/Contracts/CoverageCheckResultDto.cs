namespace Marvi.Api.Features.Coverage.Contracts;

public record CoverageCheckResultDto(bool Supported, string? WarehouseName);
