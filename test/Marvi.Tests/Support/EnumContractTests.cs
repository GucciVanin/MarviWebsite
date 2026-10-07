using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Marvi.Domain.Catalog;
using Marvi.Domain.Coverage;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;

namespace Marvi.Tests.Support;

/// <summary>
/// The SPA models enums as string unions ('Priced', 'Approved', ...), so the API must send names, not integers.
/// An integer here once made the client's "Accept" button impossible to show.
/// </summary>
public class EnumContractTests
{
    [Theory]
    [InlineData(QuoteStatus.Priced, "\"Priced\"")]
    [InlineData(OrderStatus.Placed, "\"Placed\"")]
    [InlineData(ClientAccountStatus.Suspended, "\"Suspended\"")]
    [InlineData(CoverageAreaType.Radius, "\"Radius\"")]
    [InlineData(DiscountType.Percent, "\"Percent\"")]
    public void Enums_SerializeAsNames_WithDefaultOptions(object value, string expectedJson)
    {
        Assert.Equal(expectedJson, JsonSerializer.Serialize(value, value.GetType()));
    }

    // The attribute lives on each enum (a global API option would break every test that reads responses with default
    // options). This fails the build the moment someone adds a domain enum and forgets it.
    [Fact]
    public void EveryPublicDomainEnum_IsSerializedByName()
    {
        var missing = typeof(QuoteStatus).Assembly.GetTypes()
            .Where(t => t.IsEnum && t.IsPublic)
            .Where(t => t.GetCustomAttribute<JsonConverterAttribute>()?.ConverterType != typeof(JsonStringEnumConverter))
            .Select(t => t.FullName)
            .ToList();

        Assert.True(missing.Count == 0, "Add [JsonConverter(typeof(JsonStringEnumConverter))] to: " + string.Join(", ", missing));
    }

    [Fact]
    public void Enums_StillAcceptIntegersAndNamesWhenReading()
    {
        Assert.Equal(QuoteStatus.Priced, JsonSerializer.Deserialize<QuoteStatus>("2"));
        Assert.Equal(QuoteStatus.Priced, JsonSerializer.Deserialize<QuoteStatus>("\"Priced\""));
    }
}
