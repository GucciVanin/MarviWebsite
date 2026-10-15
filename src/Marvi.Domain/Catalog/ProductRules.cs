namespace Marvi.Domain.Catalog;

/// <summary>Limits on a product's identifying fields, shared by the admin product form and the CSV import.</summary>
public static class ProductRules
{
    public const int MaxSkuLength = 64;
    public const int MaxNameLength = 200;
}
