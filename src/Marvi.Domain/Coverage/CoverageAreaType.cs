using System.Text.Json.Serialization;

namespace Marvi.Domain.Coverage;

// Serialized by name over the API (the SPA models use string unions); the database still stores the integer.
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CoverageAreaType
{
    Radius,
    Polygon
}
