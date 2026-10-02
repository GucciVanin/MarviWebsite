namespace Marvi.Api.Features.Quotes.Contracts;

public record CreateQuoteRequest(List<QuoteLineItemRequest> LineItems);
