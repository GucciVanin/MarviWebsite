namespace Marvi.Api.Features.Quotes.Contracts;

public record PriceQuoteLineRequest(Guid LineItemId, decimal FinalUnitPrice);
