namespace Marvi.Api.Features.Common;

/// <summary>One page of a larger list, with the size of the whole list so a screen can show "page 2 of 7".</summary>
public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

/// <summary>The paging rule shared by the list endpoints: pages start at 1, and one request never returns more than <see cref="MaxPageSize"/> rows.</summary>
public static class Paging
{
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 200;

    /// <summary>The reason the request is invalid, or null.</summary>
    public static string? Validate(int page, int pageSize) =>
        page < 1 || pageSize < 1 ? "page and pageSize must be at least 1." : null;

    /// <summary>Applies the cap. Long math so a huge page number cannot overflow the offset.</summary>
    public static (int PageSize, int Skip) Resolve(int page, int pageSize)
    {
        var size = Math.Min(pageSize, MaxPageSize);
        return (size, (int)Math.Min((long)(page - 1) * size, int.MaxValue));
    }
}
