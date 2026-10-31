using Marvi.Api.Features.Common;
using Marvi.Domain.Quotes;

namespace Marvi.Api.Features.Quotes.Contracts;

/// <summary>
/// A quote. `Number` is the quote's business reference and `CustomerNumber`/`CompanyName` say who it is for (MRV-9.1), so a screen can
/// name the customer without a second request and without showing an id. `DeliveryAddressSnapshot` is the address it is delivered to as it
/// was when chosen (MRV-9.6), null on a quote made before that.
/// </summary>
public record QuoteDto(Guid Id, int Number, Guid ClientAccountId, int CustomerNumber, string CompanyName, QuoteStatus Status, DateTime CreatedAt, Guid? PricedByEmployeeId, List<QuoteLineItemDto> LineItems, DeliveryAddressSnapshotDto? DeliveryAddressSnapshot = null)
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
        quote.LineItems.Select(li => new QuoteLineItemDto(li.Id, li.ProductId, li.Product?.Name ?? string.Empty, li.Qty, li.SuggestedUnitPrice, li.FinalUnitPrice)).ToList(),
        DeliveryAddressSnapshotDto.From(quote));
}
