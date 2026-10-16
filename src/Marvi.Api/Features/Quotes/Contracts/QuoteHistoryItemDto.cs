using Marvi.Domain.Quotes;

namespace Marvi.Api.Features.Quotes.Contracts;

/// <summary>A quote in the employee history (MRV-1.2a): everything in <see cref="QuoteDto"/> plus the customer's company name, so a screen can say who it is for.</summary>
public record QuoteHistoryItemDto(
    Guid Id,
    Guid ClientAccountId,
    string CompanyName,
    QuoteStatus Status,
    DateTime CreatedAt,
    Guid? PricedByEmployeeId,
    List<QuoteLineItemDto> LineItems)
{
    public static QuoteHistoryItemDto From(Quote quote) => new(
        quote.Id,
        quote.ClientAccountId,
        quote.ClientAccount?.CompanyName ?? string.Empty,
        quote.Status,
        quote.CreatedAt,
        quote.PricedByEmployeeId,
        quote.LineItems.Select(li => new QuoteLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.SuggestedUnitPrice, li.FinalUnitPrice)).ToList());
}
