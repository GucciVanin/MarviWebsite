namespace Marvi.Domain.Catalog;

public class Deal
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public List<Guid> ProductIds { get; set; } = new();
    public List<Guid> CategoryIds { get; set; } = new();
    public int MinQty { get; set; }
}
