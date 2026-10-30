using Marvi.Domain.Quotes;

namespace Marvi.Api.Features.Quotes.Contracts;

/// <summary>
/// A quote. `Number` is the quote's business reference and `CustomerNumber`/`CompanyName` say who it is for (MRV-9.1), so a screen can
/// name the customer without a second request and without showing an id.
/// </summary>
public record QuoteDto(Guid Id, int Number, Guid ClientAccountId, int CustomerNumber, string CompanyName, QuoteStatus Status, DateTime CreatedAt, Guid? PricedByEmployeeId, List<QuoteLineItemDto> LineItems)
{
    /// <summary>The one mapping from a Quote (with its line items and their products, and its customer, loaded) to its API shape.</summary>
    public static QuoteDto From(Quote quote) => new(
        quote.Id,
        quote.Number,
        quote.ClientAccountId,
        quote.ClientAccount?.Number ?? 0,
        quote.ClientAccount?.CompanyName ?? string.Empty,
        quote.Status,
        quote.CreatedAt,
        quote.PricedByEmployeeId,
        quote.LineItems.Select(li => new QuoteLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.SuggestedUnitPrice, li.FinalUnitPrice)).ToList());
}
