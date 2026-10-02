using Marvi.Domain.Inventory;

namespace Marvi.Domain.Catalog;

public class Product
{
    public Guid Id { get; set; }
    public string Sku { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? CategoryId { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsActive { get; set; } = true;

    // Spec sheet (brand, dimensions, weight, unit of measure, case qty, certifications, etc.); Infrastructure maps this to a jsonb column.
    public Dictionary<string, string> Attributes { get; set; } = new();

    public List<ProductPricing> ProductPricings { get; set; } = new();
    public List<InventoryRecord> InventoryRecords { get; set; } = new();
}
