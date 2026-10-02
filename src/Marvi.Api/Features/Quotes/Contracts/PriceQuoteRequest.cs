namespace Marvi.Api.Features.Quotes.Contracts;

public record PriceQuoteRequest(List<PriceQuoteLineRequest> LineItems);
