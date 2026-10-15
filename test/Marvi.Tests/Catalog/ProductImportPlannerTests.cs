using Marvi.Domain.Catalog;

namespace Marvi.Tests.Catalog;

/// <summary>MRV-2.1: the rules for checking a product CSV, at the pure Domain seam (no database, no HTTP).</summary>
public class ProductImportPlannerTests
{
    private static readonly Guid BeerId = Guid.NewGuid();
    private static readonly Guid DefaultTier = Guid.NewGuid();
    private static readonly Guid GoldTier = Guid.NewGuid();

    private static ImportCatalog Catalog(bool canImportStock = true) => new(
        new Dictionary<string, Guid> { ["Cervejas"] = BeerId },
        new Dictionary<string, Guid> { ["Standard"] = DefaultTier, ["Gold"] = GoldTier },
        DefaultTier,
        canImportStock);

    private static ImportPlan Plan(string csv, bool canImportStock = true) => ProductImportPlanner.Plan(csv, Catalog(canImportStock));

    private static string[] Messages(ImportPlan plan) => plan.Errors.Select(e => $"{e.Line}: {e.Message}").ToArray();

    [Fact]
    public void AFullRow_BecomesAProduct_WithPricesStockAndAttributes()
    {
        var plan = Plan("sku,name,description,category,price,stock,attr_Marca,tier_Gold\n" +
                        "BEER-1,Lager 600ml,Cold,cervejas,\"12,50\",40,Acme,\"10,00\"\n");

        Assert.True(plan.IsValid);
        var product = Assert.Single(plan.Products);
        Assert.Equal("BEER-1", product.Sku);
        Assert.Equal("Lager 600ml", product.Name);
        Assert.Equal("Cold", product.Description);
        Assert.Equal(BeerId, product.CategoryId);
        Assert.Equal(12.5m, product.Prices[DefaultTier]);
        Assert.Equal(10m, product.Prices[GoldTier]);
        Assert.Equal(40, product.Stock);
        Assert.Equal("Acme", product.Attributes["Marca"]);
    }

    [Fact]
    public void BlankCells_MeanNoValue_SoAReimportDoesNotWipeExistingData()
    {
        var plan = Plan("sku,name,description,category,price,stock,attr_Marca\nA,Alpha,,,,,\n");

        var product = Assert.Single(plan.Products);
        Assert.Null(product.Description);
        Assert.Null(product.CategoryId);
        Assert.Empty(product.Prices);
        Assert.Null(product.Stock);
        Assert.Empty(product.Attributes);
    }

    [Fact]
    public void TheMinimalFile_NeedsOnlySkuAndName()
    {
        var plan = Plan("sku,name\nA,Alpha\nB,Beta\n");

        Assert.True(plan.IsValid);
        Assert.Equal(["A", "B"], plan.Products.Select(p => p.Sku));
    }

    [Fact]
    public void AnExcelStyleFile_Works_SemicolonsBomWindowsLineEndingsAndBlankLines()
    {
        var plan = Plan("﻿sku;name;price\r\nA;Alpha;1.234,50\r\n\r\nB;\"Beta; the second\";3,5\r\n");

        Assert.True(plan.IsValid);
        Assert.Equal(1234.5m, plan.Products[0].Prices[DefaultTier]);
        Assert.Equal("Beta; the second", plan.Products[1].Name);
        Assert.Equal(3.5m, plan.Products[1].Prices[DefaultTier]);
    }

    [Fact]
    public void QuotedValues_MayContainCommasQuotesAndLineBreaks_AndErrorsReportTheRightLine()
    {
        var plan = Plan("sku,name,description\nA,\"Alpha, \"\"big\"\"\",\"two\nlines\"\nB,,x\n");

        // Row A spans lines 2 and 3 (a line break inside quotes), so row B, the one with the error, is on line 4.
        Assert.Equal(["4: name is required."], Messages(plan));

        var valid = Plan("sku,name,description\nA,\"Alpha, \"\"big\"\"\",\"two\nlines\"\n");
        var product = Assert.Single(valid.Products);
        Assert.Equal("Alpha, \"big\"", product.Name);
        Assert.Equal("two\nlines", product.Description);
    }

    [Theory]
    [InlineData("12.5", 12.5)]
    [InlineData("12,50", 12.5)]
    [InlineData("1.234,50", 1234.5)]
    [InlineData("1,234.50", 1234.5)]
    [InlineData("R$ 12,50", 12.5)]
    [InlineData("0", 0)]
    [InlineData("7", 7)]
    public void Prices_AreReadTheWayPeopleWriteThem(string text, double expected)
    {
        Assert.True(ProductImportPlanner.TryParseMoney(text, out var value));
        Assert.Equal((decimal)expected, value);
    }

    [Theory]
    [InlineData("-1")]
    [InlineData("abc")]
    [InlineData("1,2,3")]
    [InlineData("1.2.3")]
    [InlineData("")]
    public void Prices_ThatAreNotNumbersOfZeroOrMore_AreRefused(string text)
    {
        Assert.False(ProductImportPlanner.TryParseMoney(text, out _));
    }

    [Fact]
    public void EveryProblemInTheFile_IsReported_NotJustTheFirst_AndNothingIsPlanned()
    {
        var plan = Plan("sku,name,category,price,stock\n" +
                        "A,Alpha,Nope,abc,-3\n" +
                        ",Beta,,,\n" +
                        "C,,,,\n" +
                        "A,Again,,,\n");

        Assert.False(plan.IsValid);
        Assert.Empty(plan.Products);
        Assert.Equal(
        [
            "2: Unknown category 'Nope'. Create it first (categories are never created by an import).",
            "2: price 'abc' is not a number of 0 or more.",
            "2: stock '-3' is not a whole number of 0 or more.",
            "3: sku is required.",
            "4: name is required.",
            "5: sku 'A' already appears on line 2.",
        ], Messages(plan));
    }

    [Fact]
    public void AColumnThatIsNotInTheSchema_IsAnError_SoATypoIsNotSilentlyIgnored()
    {
        var plan = Plan("sku,name,prce\nA,Alpha,5\n");

        Assert.Single(plan.Errors);
        Assert.Contains("Unknown column 'prce'", plan.Errors[0].Message);
        Assert.Equal(1, plan.Errors[0].Line);
    }

    [Fact]
    public void MissingRequiredColumns_DuplicateColumns_AndUnknownTiers_AreHeaderErrors()
    {
        Assert.Contains("The required column 'sku' is missing.", Messages(Plan("name\nA\n")).Single(m => m.Contains("sku")));
        Assert.Contains("appears more than once", Plan("sku,name,NAME\nA,B,C\n").Errors.Single().Message);
        Assert.Contains("pricing tier that does not exist", Plan("sku,name,tier_Platinum\nA,B,5\n").Errors.Single().Message);
        Assert.Contains("has no name", Plan("sku,name,\nA,B,\n").Errors.Single().Message);
    }

    [Fact]
    public void ANameThatMoreThanOneCategoryOrTierHas_IsRefused_NotGuessed()
    {
        var catalog = Catalog() with
        {
            AmbiguousCategoryNames = new HashSet<string> { "Twice" },
            AmbiguousTierNames = new HashSet<string> { "Vip" },
        };

        var category = ProductImportPlanner.Plan("sku,name,category\nA,Alpha,twice\n", catalog);
        var tier = ProductImportPlanner.Plan("sku,name,tier_vip\nA,Alpha,5\n", catalog);

        Assert.Contains("matches more than one category", category.Errors.Single().Message);
        Assert.Contains("more than one tier has", tier.Errors.Single().Message);
    }

    [Fact]
    public void PriceAndTheDefaultTiersColumn_CannotBothBeGiven()
    {
        var plan = Plan("sku,name,price,tier_Standard\nA,Alpha,5,6\n");

        Assert.Contains("both the price of the default tier", plan.Errors.Single().Message);
    }

    [Fact]
    public void Stock_NeedsAChosenWarehouse()
    {
        var plan = Plan("sku,name,stock\nA,Alpha,5\n", canImportStock: false);

        Assert.Contains("stock needs a warehouse", plan.Errors.Single().Message);
        Assert.True(Plan("sku,name\nA,Alpha\n", canImportStock: false).IsValid);
    }

    [Fact]
    public void LimitsOnSkuAndName_AreTheAdminFormsLimits()
    {
        var plan = Plan($"sku,name\n{new string('S', ProductRules.MaxSkuLength + 1)},{new string('N', ProductRules.MaxNameLength + 1)}\n");

        Assert.Equal(2, plan.Errors.Count);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   \n  ")]
    [InlineData("sku,name\n")]
    public void AnEmptyFileOrOneWithoutProducts_IsRefused(string csv)
    {
        Assert.False(Plan(csv).IsValid);
    }

    [Fact]
    public void AnUnclosedQuote_IsReportedWithItsLine()
    {
        var plan = Plan("sku,name\nA,\"Alpha\n");

        Assert.Contains("starts on line 2", plan.Errors.Single().Message);
    }

    [Fact]
    public void ARowWithMoreValuesThanColumns_IsAnError()
    {
        var plan = Plan("sku,name\nA,Alpha,extra\n");

        Assert.Contains("3 values but the header has 2 columns", plan.Errors.Single().Message);
    }

    [Fact]
    public void MoreThanTheMaximumNumberOfProducts_IsRefusedBeforeAnythingIsChecked()
    {
        var rows = string.Join('\n', Enumerable.Range(0, ProductImportPlanner.MaxRows + 1).Select(i => $"S{i},N{i}"));

        var plan = Plan($"sku,name\n{rows}\n");

        Assert.Contains($"at most {ProductImportPlanner.MaxRows}", plan.Errors.Single().Message);
    }
}
