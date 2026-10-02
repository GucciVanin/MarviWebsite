namespace Marvi.Domain.Coverage;

public class CoverageService
{
    private const double EarthRadiusMiles = 3958.8;

    public CoverageCheckResult CheckCoverage(double lat, double lng, IEnumerable<(Warehouse Warehouse, CoverageArea Area)> areas)
    {
        foreach (var (warehouse, area) in areas)
        {
            switch (area.Type)
            {
                case CoverageAreaType.Radius:
                    if (area.RadiusMiles.HasValue && HaversineMiles(lat, lng, warehouse.Latitude, warehouse.Longitude) <= area.RadiusMiles.Value)
                    {
                        return new CoverageCheckResult { Supported = true, Warehouse = warehouse };
                    }
                    break;
                case CoverageAreaType.Polygon:
                    // TODO: implement point-in-polygon against area.PolygonGeoJson in Phase 2.
                    throw new NotSupportedException("Polygon coverage is Phase 2");
                default:
                    break;
            }
        }

        return new CoverageCheckResult { Supported = false, Warehouse = null };
    }

    private static double HaversineMiles(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLng = ToRadians(lng2 - lng1);

        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
            + Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2))
            * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);

        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

        return EarthRadiusMiles * c;
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180.0;
}
