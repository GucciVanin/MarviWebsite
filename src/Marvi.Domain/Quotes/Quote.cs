using Marvi.Domain.Identity;

namespace Marvi.Domain.Quotes;

public class Quote
{
    public Guid Id { get; set; }
    public Guid ClientAccountId { get; set; }
    public ClientAccount? ClientAccount { get; set; }
    public QuoteStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid? PricedByEmployeeId { get; set; }
    public EmployeeAccount? PricedByEmployee { get; set; }
    public List<QuoteLineItem> LineItems { get; set; } = new();
}
