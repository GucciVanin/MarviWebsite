using Marvi.Domain.Catalog;

namespace Marvi.Tests.Catalog;

/// <summary>MRV-9.5: the rules of the guided product form, without the API.</summary>
public class ProductRulesTests
{
    private static ProductInput Input(string sku = "COLA-2L.1_a", string name = "Cola") =>
        new(sku, name, null, null, null, null, Guid.NewGuid());

    [Fact]
    public void ACategoryIsRequired_Always()
    {
        var problems = new List<ProductProblem>();
        Assert.Null(ProductRules.Check(Input() with { CategoryId = null }, problems));
        Assert.Equal("categoryId", Assert.Single(problems).Field);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("A-b_c.9")]
    [InlineData("0123456789012345678901234567890123456789")] // 40
    public void AcceptedSkus(string sku)
    {
        var problems = new List<ProductProblem>();
        var plan = ProductRules.Check(Input(sku), problems);
        Assert.Empty(problems);
        Assert.Equal(sku, plan!.Sku);
    }

    [Theory]
    [InlineData("")]
    [InlineData("ab")]
    [InlineData("a b")]
    [InlineData("a/b")]
    [InlineData("ção")]
    [InlineData("01234567890123456789012345678901234567890")] // 41
    public void RefusedSkus(string sku)
    {
        var problems = new List<ProductProblem>();
        Assert.Null(ProductRules.Check(Input(sku), problems));
        Assert.Equal("sku", Assert.Single(problems).Field);
    }

    [Fact]
    public void TheStockRules_RefuseANegativeAndAnOversizeQuantity_AndAWarehouseListedTwice()
    {
        var w = Guid.NewGuid();
        var problems = new List<ProductProblem>();

        var kept = ProductRules.CheckStock([new(w, 0), new(Guid.NewGuid(), ProductRules.MaxStock)], problems);
        Assert.Empty(problems);
        Assert.Equal(2, kept.Count);

        ProductRules.CheckStock([new(Guid.NewGuid(), -1), new(Guid.NewGuid(), ProductRules.MaxStock + 1), new(w, 1), new(w, 2)], problems);
        Assert.Equal(new[] { "stock[0]", "stock[1]", "stock[3]" }, problems.Select(p => p.Field));
    }

    [Fact]
    public void ThePriceRules_KeepOnlyTheTypedPrices_AndRefuseTheRest()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var problems = new List<ProductProblem>();
        var kept = ProductRules.CheckPrices([new(a, 1.50m), new(b, null)], problems);
        Assert.Empty(problems);
        Assert.Equal(a, Assert.Single(kept).PricingTierId);

        ProductRules.CheckPrices([new(a, 0m), new(b, 1.005m), new(a, 3m)], problems);
        Assert.Equal(new[] { "prices[0]", "prices[1]", "prices[2]" }, problems.Select(p => p.Field));
    }

    [Fact]
    public void BlankAttributeRowsAreDropped_AndNamesAreTrimmed()
    {
        var problems = new List<ProductProblem>();
        var attributes = ProductRules.CheckAttributes(new Dictionary<string, string> { [" "] = "", [" marca "] = " Cola " }, problems);
        Assert.Empty(problems);
        Assert.Equal(new Dictionary<string, string> { ["marca"] = "Cola" }, attributes);
    }
}
