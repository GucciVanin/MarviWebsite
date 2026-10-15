namespace Marvi.Api.Features.Common;

/// <summary>The date filter shared by the history endpoints: `from` inclusive, `to` exclusive, both read as UTC.</summary>
public static class DateRange
{
    /// <summary>The reason the range is invalid, or null.</summary>
    public static string? Validate(DateTime? from, DateTime? to) =>
        from.HasValue && to.HasValue && from.Value >= to.Value ? "from must be before to." : null;

    /// <summary>A date bound without a time zone is taken as UTC (the database stores UTC only).</summary>
    public static DateTime AsUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : value, DateTimeKind.Utc);
}
