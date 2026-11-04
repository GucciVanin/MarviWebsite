using System.Text.Json;
using Marvi.Domain.Catalog;

namespace Marvi.Tests.Support;

/// <summary>
/// The product rules as data (MRV-9.8 AC-5): <c>client/src/app/features/admin-portal/catalog/product-rules.contract.json</c>, read by this
/// side (SingleProductPathTests: the limits and the three-entry-points tests) and by the client spec, so the two sides cannot drift apart unnoticed.
/// </summary>
public static class ProductRuleContract
{
    public sealed record Case(string Label, string Field, string? Prefix, string? Text, int Repeat, bool Valid)
    {
        /// <summary>The text of the case: prefix, then text repeated <c>Repeat</c> times (once when not given).</summary>
        public string Value => (Prefix ?? string.Empty) + string.Concat(Enumerable.Repeat(Text ?? string.Empty, Repeat == 0 ? 1 : Repeat));

        public override string ToString() => Label;
    }

    /// <summary>What a case puts in a product: the baseline is a valid product, the case changes one thing.</summary>
    public sealed record Sample(string Sku, string Name, string? Description, Dictionary<string, string> Attributes, string? PriceText, string? QuantityText, bool WithoutCategory = false)
    {
        /// <summary>The API field a refusal of this case is named by.</summary>
        public static string ApiField(Case c) => c.Field switch
        {
            "attributeCount" or "attributeKey" or "attributeValue" or "attributeDuplicate" => "attributes",
            "price" => "prices[0]",
            "category" => "categoryId",
            "quantity" => "stock[0]",
            var other => other,
        };

        public static Sample Of(Case c, string baseSku)
        {
            var sample = new Sample(baseSku, "Produto", null, new Dictionary<string, string>(), null, null);
            var value = c.Value;
            return c.Field switch
            {
                "sku" => sample with { Sku = value },
                "name" => sample with { Name = value },
                "description" => sample with { Description = value },
                "attributeCount" => sample with { Attributes = Enumerable.Range(0, c.Repeat).ToDictionary(i => $"k{i}", _ => "v") },
                "attributeKey" => sample with { Attributes = new() { [value] = "v" } },
                "attributeValue" => sample with { Attributes = new() { ["marca"] = value } },
                "attributeDuplicate" => sample with { Attributes = new() { [value] = "1", [value.ToUpperInvariant()] = "2" } },
                "price" => sample with { PriceText = value },
                "quantity" => sample with { QuantityText = value },
                "category" => sample with { WithoutCategory = true },
                _ => throw new InvalidOperationException($"Unknown case field '{c.Field}'."),
            };
        }
    }

    public static string FilePath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Marvi.slnx")))
        {
            dir = dir.Parent;
        }

        return Path.Combine(dir?.FullName ?? throw new InvalidOperationException("Marvi.slnx not found above the test binaries."),
            "client", "src", "app", "features", "admin-portal", "catalog", "product-rules.contract.json");
    }

    public static IReadOnlyList<Case> Cases()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(FilePath()));
        return document.RootElement.GetProperty("cases").EnumerateArray().Select(c => new Case(
            c.GetProperty("label").GetString()!,
            c.GetProperty("field").GetString()!,
            c.TryGetProperty("prefix", out var prefix) ? prefix.GetString() : null,
            c.TryGetProperty("text", out var text) ? text.GetString() : null,
            c.TryGetProperty("repeat", out var repeat) ? repeat.GetInt32() : 0,
            c.GetProperty("valid").GetBoolean())).ToList();
    }

    public static IReadOnlyDictionary<string, int> Limits()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(FilePath()));
        return document.RootElement.GetProperty("limits").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetInt32());
    }

    public static IEnumerable<object[]> CaseData() => Cases().Select(c => new object[] { c });

    /// <summary>The sample as the rules take it. A price text that is not a number cannot be a price at all (<c>null</c> with <paramref name="unparsable"/> set).</summary>
    public static ProductInput ToInput(Sample sample, out bool unparsable)
    {
        unparsable = false;
        var prices = new List<ProductPrice>();
        var stock = new List<ProductStock>();
        if (!string.IsNullOrEmpty(sample.PriceText))
        {
            if (decimal.TryParse(sample.PriceText.Replace(',', '.'), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var price))
            {
                prices.Add(new ProductPrice(Guid.NewGuid(), price));
            }
            else
            {
                unparsable = true;
            }
        }

        if (!string.IsNullOrEmpty(sample.QuantityText))
        {
            if (int.TryParse(sample.QuantityText, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var quantity))
            {
                stock.Add(new ProductStock(Guid.NewGuid(), quantity));
            }
            else
            {
                unparsable = true;
            }
        }

        return new ProductInput(sample.Sku, sample.Name, sample.Description, sample.Attributes, prices, stock, sample.WithoutCategory ? null : Guid.NewGuid());
    }
}
