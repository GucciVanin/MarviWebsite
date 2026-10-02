using Marvi.Domain.Quotes;

namespace Marvi.Api.Features.Quotes.Contracts;

public record QuoteDto(Guid Id, Guid ClientAccountId, QuoteStatus Status, DateTime CreatedAt, Guid? PricedByEmployeeId, List<QuoteLineItemDto> LineItems);
