using Marvi.Api.Features.Common;
using Marvi.Domain.Quotes;

namespace Marvi.Api.Features.Quotes.Contracts;

/// <summary>A quote in the employee history (MRV-1.2a): the same shape as <see cref="QuoteDto"/>, which already names the customer.</summary>
public record QuoteHistoryItemDto(
    Guid Id,
    int Number,
    Guid ClientAccountId,
    int CustomerNumber,
    string CompanyName,
    QuoteStatus Status,
    DateTime CreatedAt,
    Guid? PricedByEmployeeId,
    List<QuoteLineItemDto> LineItems,
    DeliveryAddressSnapshotDto? DeliveryAddressSnapshot = null)
{
    public static QuoteHistoryItemDto From(Quote quote)
    {
        var dto = QuoteDto.From(quote);
        return new QuoteHistoryItemDto(
            dto.Id, dto.Number, dto.ClientAccountId, dto.CustomerNumber, dto.CompanyName, dto.Status, dto.CreatedAt, dto.PricedByEmployeeId, dto.LineItems, dto.DeliveryAddressSnapshot);
    }
}
