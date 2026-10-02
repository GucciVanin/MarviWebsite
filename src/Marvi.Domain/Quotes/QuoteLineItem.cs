using Marvi.Domain.Catalog;

namespace Marvi.Domain.Quotes;

public class QuoteLineItem
{
    public Guid Id { get; set; }
    public Guid QuoteId { get; set; }
    public Quote? Quote { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public int Qty { get; set; }
    public decimal? SuggestedUnitPrice { get; set; }
    public decimal? FinalUnitPrice { get; set; }
}
