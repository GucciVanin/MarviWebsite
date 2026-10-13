using System.Linq.Expressions;

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

    /// <summary>
    /// The one definition of "a Deal is running at <paramref name="now"/>". An expression so the database can apply it
    /// when loading Deals; <see cref="PricingService"/> applies the same expression when pricing.
    /// </summary>
    public static Expression<Func<Deal, bool>> ActiveAt(DateTime now) => d => d.StartDate <= now && d.EndDate >= now;
}
