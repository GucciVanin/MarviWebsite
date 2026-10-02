namespace Marvi.Api.Features.Quotes.Contracts;

public record QuoteLineItemDto(Guid Id, Guid ProductId, string ProductName, int Qty, decimal? SuggestedUnitPrice, decimal? FinalUnitPrice);
