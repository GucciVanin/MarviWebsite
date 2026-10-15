using System.Globalization;

namespace Marvi.Domain.Catalog;

/// <summary>What the importer needs to know about the catalog to check names: nothing about products, only the things a row refers to.</summary>
/// <param name="CategoryIdsByName">Existing categories by name (matched ignoring case).</param>
/// <param name="TierIdsByName">Existing pricing tiers by name (matched ignoring case).</param>
/// <param name="DefaultTierId">The tier the plain `price` column is for.</param>
/// <param name="CanImportStock">Whether a warehouse has been chosen for the `stock` column.</param>
public sealed record ImportCatalog(
    IReadOnlyDictionary<string, Guid> CategoryIdsByName,
    IReadOnlyDictionary<string, Guid> TierIdsByName,
    Guid DefaultTierId,
    bool CanImportStock);

/// <summary>One product row that passed every check. A null value means the cell was blank: leave an existing value as it is.</summary>
public sealed record PlannedProduct(
    int Line,
    string Sku,
    string Name,
    string? Description,
    Guid? CategoryId,
    IReadOnlyDictionary<string, string> Attributes,
    IReadOnlyDictionary<Guid, decimal> Prices,
    int? Stock);

public sealed record ImportError(int Line, string Message);

/// <summary>The outcome of checking a file. The file is imported only when there is no error at all.</summary>
public sealed record ImportPlan(IReadOnlyList<PlannedProduct> Products, IReadOnlyList<ImportError> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// Checks a product CSV (MRV-2.1, schema from the owner's decision Q1) and turns it into rows ready to store.
/// Columns: sku, name (required), description, category, price, stock, `attr_&lt;name&gt;` (a spec-sheet attribute) and
/// `tier_&lt;name&gt;` (the price for a pricing tier). A column that is none of these is an error, so a typo such as
/// "prce" is caught instead of silently ignored. Every problem in the file is reported with its line, not just the first.
/// </summary>
public static class ProductImportPlanner
{
    public const int MaxRows = 5000;

    private const string AttributePrefix = "attr_";
    private const string TierPrefix = "tier_";
    private const int MaxAttributeNameLength = 64;
    private static readonly string[] KnownColumns = ["sku", "name", "description", "category", "price", "stock"];

    public static ImportPlan Plan(string csv, ImportCatalog catalog)
    {
        var (document, readError) = ProductCsv.Read(csv);
        if (document is null)
        {
            return Failed(1, readError!);
        }

        var categories = new Dictionary<string, Guid>(catalog.CategoryIdsByName, StringComparer.OrdinalIgnoreCase);
        var tiers = new Dictionary<string, Guid>(catalog.TierIdsByName, StringComparer.OrdinalIgnoreCase);

        var columns = ReadHeader(document.Header, tiers, out var headerErrors);
        if (headerErrors.Count > 0)
        {
            return new ImportPlan([], headerErrors);
        }

        if (document.Rows.Count == 0)
        {
            return Failed(1, "The file has a header but no products.");
        }

        if (document.Rows.Count > MaxRows)
        {
            return Failed(1, $"The file has {document.Rows.Count} products; at most {MaxRows} can be imported at once.");
        }

        var products = new List<PlannedProduct>();
        var errors = new List<ImportError>();
        var firstLineOfSku = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in document.Rows)
        {
            var rowErrors = new List<string>();
            string Cell(string column) => columns.TryGetValue(column, out var index) && index < row.Cells.Count ? row.Cells[index] : string.Empty;

            if (row.Cells.Count > document.Header.Count)
            {
                rowErrors.Add($"The row has {row.Cells.Count} values but the header has {document.Header.Count} columns.");
            }

            var sku = Cell("sku");
            if (sku.Length == 0)
            {
                rowErrors.Add("sku is required.");
            }
            else if (sku.Length > ProductRules.MaxSkuLength)
            {
                rowErrors.Add($"sku is limited to {ProductRules.MaxSkuLength} characters.");
            }
            else if (firstLineOfSku.TryGetValue(sku, out var firstLine))
            {
                rowErrors.Add($"sku '{sku}' already appears on line {firstLine}.");
            }
            else
            {
                firstLineOfSku[sku] = row.Line;
            }

            var name = Cell("name");
            if (name.Length == 0)
            {
                rowErrors.Add("name is required.");
            }
            else if (name.Length > ProductRules.MaxNameLength)
            {
                rowErrors.Add($"name is limited to {ProductRules.MaxNameLength} characters.");
            }

            Guid? categoryId = null;
            var categoryName = Cell("category");
            if (categoryName.Length > 0)
            {
                if (categories.TryGetValue(categoryName, out var id))
                {
                    categoryId = id;
                }
                else
                {
                    rowErrors.Add($"Unknown category '{categoryName}'. Create it first (categories are never created by an import).");
                }
            }

            var prices = new Dictionary<Guid, decimal>();
            var priceCell = Cell("price");
            if (priceCell.Length > 0)
            {
                if (TryParseMoney(priceCell, out var price))
                {
                    prices[catalog.DefaultTierId] = price;
                }
                else
                {
                    rowErrors.Add($"price '{priceCell}' is not a number of 0 or more.");
                }
            }

            foreach (var (column, tierId) in columns.Keys.Where(k => k.StartsWith(TierPrefix, StringComparison.OrdinalIgnoreCase)).Select(k => (k, tiers[k[TierPrefix.Length..]])))
            {
                var tierCell = Cell(column);
                if (tierCell.Length == 0)
                {
                    continue;
                }

                if (!TryParseMoney(tierCell, out var tierPrice))
                {
                    rowErrors.Add($"{column} '{tierCell}' is not a number of 0 or more.");
                }
                else if (!prices.TryAdd(tierId, tierPrice))
                {
                    rowErrors.Add($"{column} and price are both the price of the default tier; give only one.");
                }
            }

            int? stock = null;
            var stockCell = Cell("stock");
            if (stockCell.Length > 0)
            {
                if (!int.TryParse(stockCell, NumberStyles.None, CultureInfo.InvariantCulture, out var quantity))
                {
                    rowErrors.Add($"stock '{stockCell}' is not a whole number of 0 or more.");
                }
                else if (!catalog.CanImportStock)
                {
                    rowErrors.Add("stock needs a warehouse: choose one for the import (there is not exactly one warehouse).");
                }
                else
                {
                    stock = quantity;
                }
            }

            var attributes = new Dictionary<string, string>();
            foreach (var column in columns.Keys.Where(k => k.StartsWith(AttributePrefix, StringComparison.OrdinalIgnoreCase)))
            {
                var value = Cell(column);
                if (value.Length > 0)
                {
                    attributes[column[AttributePrefix.Length..]] = value;
                }
            }

            if (rowErrors.Count > 0)
            {
                errors.AddRange(rowErrors.Select(message => new ImportError(row.Line, message)));
                continue;
            }

            var description = Cell("description");
            products.Add(new PlannedProduct(row.Line, sku, name, description.Length == 0 ? null : description, categoryId, attributes, prices, stock));
        }

        return errors.Count > 0 ? new ImportPlan([], errors) : new ImportPlan(products, []);
    }

    /// <summary>The column index by (lower-cased, except attribute names) column name, with every header problem reported on line 1.</summary>
    private static Dictionary<string, int> ReadHeader(IReadOnlyList<string> header, Dictionary<string, Guid> tiers, out List<ImportError> errors)
    {
        errors = [];
        var columns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < header.Count; index++)
        {
            var name = header[index];
            if (name.Length == 0)
            {
                errors.Add(new ImportError(1, $"Column {index + 1} has no name."));
            }
            else if (columns.ContainsKey(name))
            {
                errors.Add(new ImportError(1, $"Column '{name}' appears more than once."));
            }
            else if (name.StartsWith(AttributePrefix, StringComparison.OrdinalIgnoreCase))
            {
                var attribute = name[AttributePrefix.Length..];
                if (attribute.Length == 0 || attribute.Length > MaxAttributeNameLength)
                {
                    errors.Add(new ImportError(1, $"Column '{name}' needs an attribute name of 1 to {MaxAttributeNameLength} characters after '{AttributePrefix}'."));
                }
                else
                {
                    columns[name] = index;
                }
            }
            else if (name.StartsWith(TierPrefix, StringComparison.OrdinalIgnoreCase))
            {
                if (tiers.ContainsKey(name[TierPrefix.Length..]))
                {
                    columns[name] = index;
                }
                else
                {
                    errors.Add(new ImportError(1, $"Column '{name}' names a pricing tier that does not exist."));
                }
            }
            else if (KnownColumns.Contains(name, StringComparer.OrdinalIgnoreCase))
            {
                columns[name.ToLowerInvariant()] = index;
            }
            else
            {
                errors.Add(new ImportError(1, $"Unknown column '{name}'. Expected {string.Join(", ", KnownColumns)}, attr_<name> or tier_<name>."));
            }
        }

        foreach (var required in new[] { "sku", "name" }.Where(r => !columns.ContainsKey(r)))
        {
            errors.Add(new ImportError(1, $"The required column '{required}' is missing."));
        }

        return columns;
    }

    /// <summary>
    /// A price as people write it: 12.5, 12,50, 1.234,50, 1,234.50 or R$ 12,50. When both separators appear, the last
    /// one is the decimal point; a lone comma is a decimal comma. No sign.
    /// </summary>
    public static bool TryParseMoney(string text, out decimal value)
    {
        value = 0;
        var s = text.Replace("R$", "", StringComparison.OrdinalIgnoreCase).Replace(" ", "");
        var lastComma = s.LastIndexOf(',');
        var lastDot = s.LastIndexOf('.');
        if (lastComma >= 0 && lastDot >= 0)
        {
            s = lastComma > lastDot ? s.Replace(".", "").Replace(',', '.') : s.Replace(",", "");
        }
        else if (lastComma >= 0)
        {
            if (s.IndexOf(',') != lastComma)
            {
                return false;
            }

            s = s.Replace(',', '.');
        }
        else if (lastDot >= 0 && s.IndexOf('.') != lastDot)
        {
            return false;
        }

        return decimal.TryParse(s, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out value);
    }

    private static ImportPlan Failed(int line, string message) => new([], [new ImportError(line, message)]);
}
