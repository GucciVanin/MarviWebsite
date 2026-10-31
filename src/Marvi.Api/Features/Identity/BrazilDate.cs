namespace Marvi.Api.Features.Identity;

/// <summary>Today's date in Brazil (the age and opening-date rules count days there). Brazil has no daylight saving since 2019, so this is UTC minus 3 hours. Replaced in tests to pin the date.</summary>
public interface IBrazilDate
{
    DateOnly Today { get; }
}

public sealed class BrazilDate(TimeProvider? clock = null) : IBrazilDate
{
    private readonly TimeProvider _clock = clock ?? TimeProvider.System;

    public DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime.AddHours(-3));
}
