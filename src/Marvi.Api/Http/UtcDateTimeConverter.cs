using System.Text.Json;
using System.Text.Json.Serialization;

namespace Marvi.Api.Http;

/// <summary>
/// Reads every incoming <see cref="DateTime"/> as UTC. A date sent without a time zone ("2026-10-01T00:00:00" or
/// "2026-10-01") arrives as <see cref="DateTimeKind.Unspecified"/>, which Npgsql refuses to write to a
/// <c>timestamptz</c> column (a 500). Treating it as UTC keeps the API unambiguous: stored and returned times are UTC.
/// </summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetDateTime();
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value);
}
