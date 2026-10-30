using Marvi.Domain.Identity;

namespace Marvi.Domain.Quotes;

public class Quote
{
    public Guid Id { get; set; }
    /// <summary>The quote number (MRV-9.1), assigned once by the database on insert; unique, never reused, never changed.</summary>
    public int Number { get; set; }
    public Guid ClientAccountId { get; set; }
    public ClientAccount? ClientAccount { get; set; }
    public QuoteStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid? PricedByEmployeeId { get; set; }
    public EmployeeAccount? PricedByEmployee { get; set; }
    public List<QuoteLineItem> LineItems { get; set; } = new();
}
