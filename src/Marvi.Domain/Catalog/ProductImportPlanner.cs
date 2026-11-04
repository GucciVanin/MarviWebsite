using System.Globalization;

namespace Marvi.Domain.Catalog;

/// <summary>What the importer needs to know about the catalog to check names: nothing about products, only the things a row refers to.</summary>
/// <param name="CategoryIdsByName">Existing categories by name (matched ignoring case).</param>
/// <param name="TierIdsByName">Existing pricing tiers by name (matched ignoring case).</param>
/// <param name="DefaultTierId">The tier the plain `price` column is for.</param>
/// <param name="CanImportStock">Whether a warehouse has been chosen for the `stock` column.</param>
/// <param name="AmbiguousCategoryNames">Category names that more than one category has; a row or column that uses one is refused rather than guessed.</param>
/// <param name="AmbiguousTierNames">The same for pricing tier names (tier names are not unique in the database).</param>
/// <param name="ExistingProducts">The stored products by SKU (ignoring case): what a row would leave as it is (blank cells) and merge with. The import checks the product as it would be stored, so a row for a stored product that breaks the rules is refused until the product is fixed.</param>
public sealed record ImportCatalog(
    IReadOnlyDictionary<string, Guid> CategoryIdsByName,
    IReadOnlyDictionary<string, Guid> TierIdsByName,
    Guid DefaultTierId,
    bool CanImportStock,
    IReadOnlySet<string>? AmbiguousCategoryNames = null,
    IReadOnlySet<string>? AmbiguousTierNames = null,
    IReadOnlyDictionary<string, ExistingProduct>? ExistingProducts = null);

/// <summary>The stored fields of a product that an import row can leave unchanged.</summary>
public sealed record ExistingProduct(string? Description, IReadOnlyDictionary<string, string> Attributes, Guid? CategoryId = null);

/// <summary>One product row that passed every check. A null description or category means the cell was blank: leave an existing value as it is. <c>Attributes</c> is the complete cleaned set to store when the row has any attribute cell (existing ones merged ignoring case), empty otherwise.</summary>
public sealed record PlannedProduct(
    int Line,
    string Sku,
    string Name,
    string? Description,
    Guid? CategoryId,
    IReadOnlyDictionary<string, string> Attributes,
    IReadOnlyDictionary<Guid, decimal> Prices,
    int? Stock);

/// <summary>One problem in the file: its line (1 is the header), the row's SKU and the field when the problem is about one row.</summary>
public sealed record ImportError(int Line, string Message, string? Sku = null, string? Field = null);

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
/// Each row is checked by <see cref="ProductRules"/> (MRV-9.8), the validator create and edit use too, on the product as it would be stored.
/// </summary>
public static class ProductImportPlanner
{
    public const int MaxRows = 5000;

    private const string AttributePrefix = "attr_";
    private const string TierPrefix = "tier_";
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
        var ambiguousCategories = new HashSet<string>(catalog.AmbiguousCategoryNames ?? new HashSet<string>(), StringComparer.OrdinalIgnoreCase);
        var ambiguousTiers = new HashSet<string>(catalog.AmbiguousTierNames ?? new HashSet<string>(), StringComparer.OrdinalIgnoreCase);

        // Excel exports often end every line with a separator: trailing empty header cells and empty trailing values are ignored.
        var header = document.Header.Reverse().SkipWhile(h => h.Length == 0).Reverse().ToList();
        var columns = ReadHeader(header, tiers, ambiguousTiers, out var headerErrors);
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

        var existingProducts = catalog.ExistingProducts is null
            ? new Dictionary<string, ExistingProduct>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, ExistingProduct>(catalog.ExistingProducts, StringComparer.OrdinalIgnoreCase);

        foreach (var row in document.Rows)
        {
            var rowErrors = new List<(string? Field, string Message)>();
            string Cell(string column) => columns.TryGetValue(column, out var index) && index < row.Cells.Count ? row.Cells[index] : string.Empty;

            var usedCells = row.Cells.Count - row.Cells.Reverse().TakeWhile(c => c.Length == 0).Count();
            if (usedCells > header.Count)
            {
                rowErrors.Add((null, $"The row has {usedCells} values but the header has {header.Count} columns."));
            }

            var sku = Cell("sku");
            if (sku.Length > 0 && firstLineOfSku.TryGetValue(sku, out var firstLine))
            {
                rowErrors.Add(("sku", $"sku '{sku}' already appears on line {firstLine}."));
            }
            else if (sku.Length > 0)
            {
                firstLineOfSku[sku] = row.Line;
            }

            var name = Cell("name");

            Guid? categoryId = null;
            var categoryName = Cell("category");
            if (categoryName.Length > 0)
            {
                if (ambiguousCategories.Contains(categoryName))
                {
                    rowErrors.Add(("category", $"Category '{categoryName}' matches more than one category; rename one of them first."));
                }
                else if (categories.TryGetValue(categoryName, out var id))
                {
                    categoryId = id;
                }
                else
                {
                    rowErrors.Add(("category", $"Unknown category '{categoryName}'. Create it first (categories are never created by an import)."));
                }
            }

            // The prices as typed, in the order of the columns; the price rules (above zero, two decimals, in range) are ProductRules'.
            var priceRows = new List<ProductPrice>();
            var priceColumns = new List<string>();
            var priceCell = Cell("price");
            if (priceCell.Length > 0)
            {
                if (TryParseMoney(priceCell, out var price))
                {
                    priceRows.Add(new ProductPrice(catalog.DefaultTierId, price));
                    priceColumns.Add("price");
                }
                else
                {
                    rowErrors.Add(("price", $"price '{priceCell}' is not an amount with at most 2 decimals (write 1.234,00 or 1234, not 1.234)."));
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
                    rowErrors.Add((column, $"{column} '{tierCell}' is not an amount with at most 2 decimals (write 1.234,00 or 1234, not 1.234)."));
                }
                else if (priceRows.Any(p => p.PricingTierId == tierId))
                {
                    rowErrors.Add((column, $"{column} and price are both the price of the default tier; give only one."));
                }
                else
                {
                    priceRows.Add(new ProductPrice(tierId, tierPrice));
                    priceColumns.Add(column);
                }
            }

            ProductStock? stockRow = null;
            var stockCell = Cell("stock");
            if (stockCell.Length > 0)
            {
                if (!int.TryParse(stockCell, NumberStyles.None, CultureInfo.InvariantCulture, out var quantity))
                {
                    rowErrors.Add(("stock", $"stock '{stockCell}' is not a whole number of 0 or more."));
                }
                else if (!catalog.CanImportStock)
                {
                    rowErrors.Add(("stock", "stock needs a warehouse: choose one for the import (there is not exactly one warehouse)."));
                }
                else
                {
                    stockRow = new ProductStock(Guid.Empty, quantity);
                }
            }

            // The product as it would be stored: the cells of the row over what the stored product keeps (a blank cell leaves it as it is).
            existingProducts.TryGetValue(sku, out var existing);
            var attributeCells = new Dictionary<string, string>();
            foreach (var column in columns.Keys.Where(k => k.StartsWith(AttributePrefix, StringComparison.OrdinalIgnoreCase)))
            {
                var value = Cell(column);
                if (value.Length > 0)
                {
                    attributeCells[column[AttributePrefix.Length..]] = value;
                }
            }

            var attributes = new Dictionary<string, string>(existing?.Attributes ?? new Dictionary<string, string>());
            foreach (var (rawKey, value) in attributeCells)
            {
                var key = rawKey.Trim();
                // The key matches ignoring case, so a spelling that differs only in case replaces the stored one instead of sitting beside it.
                foreach (var same in attributes.Keys.Where(k => string.Equals(k.Trim(), key, StringComparison.OrdinalIgnoreCase)).ToList())
                {
                    attributes.Remove(same);
                }

                attributes[key] = value;
            }

            var description = Cell("description");
            var problems = new List<ProductProblem>();
            var plan = ProductRules.Check(
                new ProductInput(sku, name, description.Length > 0 ? description : existing?.Description, attributes,
                    priceRows, stockRow is null ? null : [stockRow],
                    // A category is required like everywhere else: the cell, else the stored one. A cell that names an unknown category already has its own error.
                    categoryId ?? existing?.CategoryId ?? (categoryName.Length > 0 ? Guid.Empty : null)),
                problems);
            foreach (var problem in problems)
            {
                rowErrors.Add((ImportField(problem.Field, priceColumns), problem.Message));
            }

            if (rowErrors.Count > 0)
            {
                errors.AddRange(rowErrors.Select(e => new ImportError(row.Line, e.Message, sku.Length > 0 ? sku : null, e.Field)));
                continue;
            }

            products.Add(new PlannedProduct(row.Line, plan!.Sku, plan.Name, description.Length == 0 ? null : plan.Description, categoryId,
                attributeCells.Count > 0 ? plan.Attributes : new Dictionary<string, string>(),
                plan.Prices.ToDictionary(p => p.PricingTierId, p => p.UnitPrice!.Value), stockRow is null ? null : plan.Stock.Single().QtyOnHand));
        }

        return errors.Count > 0 ? new ImportPlan([], errors) : new ImportPlan(products, []);
    }

    // The rules name a price row as prices[i] and the stock row as stock[0]; the import names the column the value came from.
    private static string ImportField(string field, IReadOnlyList<string> priceColumns)
    {
        if (field.StartsWith("prices[", StringComparison.Ordinal) && int.TryParse(field["prices[".Length..^1], out var index) && index < priceColumns.Count)
        {
            return priceColumns[index];
        }

        return field == "categoryId" ? "category" : field.StartsWith("stock[", StringComparison.Ordinal) ? "stock" : field;
    }

    /// <summary>The column index by (lower-cased, except attribute names) column name, with every header problem reported on line 1.</summary>
    private static Dictionary<string, int> ReadHeader(IReadOnlyList<string> header, Dictionary<string, Guid> tiers, HashSet<string> ambiguousTiers, out List<ImportError> errors)
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
                if (attribute.Length == 0 || attribute.Length > ProductRules.MaxAttributeKeyLength)
                {
                    errors.Add(new ImportError(1, $"Column '{name}' needs an attribute name of 1 to {ProductRules.MaxAttributeKeyLength} characters after '{AttributePrefix}'."));
                }
                else
                {
                    columns[name] = index;
                }
            }
            else if (name.StartsWith(TierPrefix, StringComparison.OrdinalIgnoreCase))
            {
                if (ambiguousTiers.Contains(name[TierPrefix.Length..]))
                {
                    errors.Add(new ImportError(1, $"Column '{name}' names a pricing tier that more than one tier has; rename one of them first."));
                }
                else if (tiers.ContainsKey(name[TierPrefix.Length..]))
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
    /// one is the decimal point; a lone comma is a decimal comma. No sign, and at most two decimals (so an ambiguous "1.234" is refused).
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

        // Money has at most two decimals. Anything longer is refused rather than guessed: a Brazilian "1.234" means R$ 1.234, but would be
        // read as 1.234 here. Write 1.234,00 (or 1234) instead.
        var point = s.IndexOf('.');
        return (point < 0 || s.Length - point - 1 <= 2)
            && decimal.TryParse(s, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out value);
    }

    private static ImportPlan Failed(int line, string message) => new([], [new ImportError(line, message)]);
}
