namespace Marvi.Domain.Coverage;

public class CoverageCheckResult
{
    public required bool Supported { get; init; }
    public Warehouse? Warehouse { get; init; }
}
