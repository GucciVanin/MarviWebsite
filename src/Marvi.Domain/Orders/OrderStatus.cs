using System.Text.Json.Serialization;

namespace Marvi.Domain.Orders;

// Serialized by name over the API (the SPA models use string unions); the database still stores the integer.
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OrderStatus
{
    Placed,
    Backordered,
    Fulfilled,
    Cancelled
}
