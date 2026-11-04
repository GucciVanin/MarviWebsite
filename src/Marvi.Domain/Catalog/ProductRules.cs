using System.Text.RegularExpressions;
using Marvi.Domain.Identity;

namespace Marvi.Domain.Catalog;

/// <summary>One thing wrong with a field, named by its API field (serialized as <c>{ field, message }</c>). The message never repeats the value.</summary>
public sealed record ProductProblem(string Field, string Message);

/// <summary>A price typed for a pricing tier (null: none typed).</summary>
public sealed record ProductPrice(Guid PricingTierId, decimal? UnitPrice);

/// <summary>An opening quantity typed for a warehouse (null: none typed).</summary>
public sealed record ProductStock(Guid WarehouseId, int? QtyOnHand);

/// <summary>What was submitted for a product, before it is checked. <c>Prices</c> and <c>Stock</c> are null when the entry point has none (an edit).</summary>
public sealed record ProductInput(
    string? Sku,
    string? Name,
    string? Description,
    IReadOnlyDictionary<string, string>? Attributes,
    IReadOnlyList<ProductPrice>? Prices,
    IReadOnlyList<ProductStock>? Stock,
    Guid? CategoryId);

/// <summary>The same data once checked and cleaned: only the prices and quantities that were typed, text trimmed, attribute rows without blanks.</summary>
public sealed record ProductPlan(
    string Sku,
    string Name,
    string? Description,
    Dictionary<string, string> Attributes,
    List<ProductPrice> Prices,
    List<ProductStock> Stock);

/// <summary>
/// THE product validator (MRV-9.8): create (<c>POST with-setup</c>), edit (<c>PUT</c>) and the CSV import all call it, and nothing else
/// decides whether a product is acceptable. (The photo is not text: an uploaded file is checked by <see cref="ProductPhotoRules"/> and linked by token, MRV-9.7.) SKU, name, description, structured attributes, prices and opening stock.
/// Messages are pt-BR, name the field and never echo the value. Checks that need the database (the SKU is free, the category, tier and
/// warehouse exist) stay in the callers. The client mirrors the numbers (<c>product-rules.ts</c>) and a contract file keeps the two equal.
/// </summary>
public static partial class ProductRules
{
    public const int MinSkuLength = 3;
    public const int MaxSkuLength = 40;
    public const int MaxNameLength = 200;
    public const int MinNameLength = 2;
    public const int MaxDescriptionLength = 2000;
    public const int MaxAttributes = 30;
    public const int MaxAttributeKeyLength = 60;
    public const int MaxAttributeValueLength = 200;
    public const int MaxStock = 1_000_000;
    /// <summary>At most this many price rows and this many stock rows in one request (a shop has a handful of tiers and warehouses).</summary>
    public const int MaxRows = 200;
    /// <summary>The largest price a decimal(18,2) column holds.</summary>
    public const decimal MaxPrice = 9_999_999_999_999_999.99m;

    [GeneratedRegex("^[A-Za-z0-9._-]+$")]
    private static partial Regex SkuShape();

    /// <summary>The cleaned plan, or null with the problems added to <paramref name="problems"/>.</summary>
    public static ProductPlan? Check(ProductInput input, List<ProductProblem> problems)
    {
        var before = problems.Count;
        var sku = input.Sku?.Trim() ?? string.Empty;
        var name = input.Name?.Trim() ?? string.Empty;

        if (sku.Length < MinSkuLength || sku.Length > MaxSkuLength || !SkuShape().IsMatch(sku))
        {
            problems.Add(new("sku", $"O código (SKU) deve ter de {MinSkuLength} a {MaxSkuLength} caracteres: letras, números, hífen, sublinhado ou ponto."));
        }

        if (name.Length < MinNameLength || name.Length > MaxNameLength || ClientAddressRules.HasForbiddenCharacters(name))
        {
            problems.Add(new("name", $"O nome deve ter de {MinNameLength} a {MaxNameLength} caracteres, sem caracteres de controle."));
        }

        if (input.CategoryId is null)
        {
            problems.Add(new("categoryId", "Escolha a categoria do produto."));
        }

        var description = CheckDescription(input.Description, problems);
        var attributes = CheckAttributes(input.Attributes, problems);
        var prices = CheckPrices(input.Prices, problems);
        var stock = CheckStock(input.Stock, problems);

        return problems.Count > before ? null : new ProductPlan(sku, name, description, attributes, prices, stock);
    }

    public static string? CheckDescription(string? description, List<ProductProblem> problems)
    {
        var text = description?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }

        if (text.Length > MaxDescriptionLength || text.Any(c => c is not ('\n' or '\r' or '\t') && ClientAddressRules.HasForbiddenCharacters(c.ToString())))
        {
            problems.Add(new("description", $"A descrição deve ter no máximo {MaxDescriptionLength} caracteres, sem caracteres de controle."));
        }

        return text;
    }

    /// <summary>Rows with a blank name and a blank value are dropped; the others need both, within the limits and without repeating a name (ignoring case).</summary>
    public static Dictionary<string, string> CheckAttributes(IReadOnlyDictionary<string, string>? attributes, List<ProductProblem> problems)
    {
        var result = new Dictionary<string, string>();
        if (attributes is null)
        {
            return result;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var rows = 0;
        foreach (var (rawKey, rawValue) in attributes)
        {
            var key = rawKey?.Trim() ?? string.Empty;
            var value = rawValue?.Trim() ?? string.Empty;
            if (key.Length == 0 && value.Length == 0)
            {
                continue;
            }

            rows++;
            if (key.Length == 0 || key.Length > MaxAttributeKeyLength || ClientAddressRules.HasForbiddenCharacters(key))
            {
                problems.Add(new("attributes", $"O nome de cada atributo deve ter de 1 a {MaxAttributeKeyLength} caracteres."));
            }
            else if (value.Length == 0 || value.Length > MaxAttributeValueLength || ClientAddressRules.HasForbiddenCharacters(value))
            {
                problems.Add(new("attributes", $"O valor de cada atributo deve ter de 1 a {MaxAttributeValueLength} caracteres."));
            }
            else if (!seen.Add(key))
            {
                problems.Add(new("attributes", "Há atributos com o mesmo nome. Cada nome só pode aparecer uma vez."));
            }
            else
            {
                result[key] = value;
            }
        }

        if (rows > MaxAttributes)
        {
            problems.Add(new("attributes", $"Use no máximo {MaxAttributes} atributos."));
        }

        return result;
    }

    /// <summary>Only the tiers that have a price: above zero, at most two decimals, inside the column; a tier listed twice is refused. Field: <c>prices[i]</c>.</summary>
    public static List<ProductPrice> CheckPrices(IReadOnlyList<ProductPrice>? prices, List<ProductProblem> problems)
    {
        var kept = new List<ProductPrice>();
        if (prices?.Count > MaxRows)
        {
            problems.Add(new("prices", $"Informe no máximo {MaxRows} preços."));
            return kept;
        }

        var seen = new HashSet<Guid>();
        for (var i = 0; i < (prices?.Count ?? 0); i++)
        {
            var row = prices![i];
            if (!seen.Add(row.PricingTierId))
            {
                problems.Add(new($"prices[{i}]", "Cada faixa de preço só pode aparecer uma vez."));
            }
            else if (row.UnitPrice is { } price)
            {
                if (price <= 0 || price > MaxPrice || decimal.Round(price, 2) != price)
                {
                    problems.Add(new($"prices[{i}]", "O preço deve ser maior que zero, com no máximo duas casas decimais."));
                }
                else
                {
                    kept.Add(row);
                }
            }
        }

        return kept;
    }

    /// <summary>Only the warehouses that have a quantity (zero counts): a whole number from 0 to 1,000,000; a warehouse listed twice is refused. Field: <c>stock[i]</c>.</summary>
    public static List<ProductStock> CheckStock(IReadOnlyList<ProductStock>? stock, List<ProductProblem> problems)
    {
        var kept = new List<ProductStock>();
        if (stock?.Count > MaxRows)
        {
            problems.Add(new("stock", $"Informe no máximo {MaxRows} quantidades."));
            return kept;
        }

        var seen = new HashSet<Guid>();
        for (var i = 0; i < (stock?.Count ?? 0); i++)
        {
            var row = stock![i];
            if (!seen.Add(row.WarehouseId))
            {
                problems.Add(new($"stock[{i}]", "Cada armazém só pode aparecer uma vez."));
            }
            else if (row.QtyOnHand is { } qty)
            {
                if (qty < 0 || qty > MaxStock)
                {
                    problems.Add(new($"stock[{i}]", "A quantidade deve ser um número inteiro de 0 a 1.000.000."));
                }
                else
                {
                    kept.Add(row);
                }
            }
        }

        return kept;
    }
}
