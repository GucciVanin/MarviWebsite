namespace Marvi.Api.Features.Quotes.Contracts;

/// <param name="DeliveryAddressKey">The key of the customer's address to deliver to (MRV-9.6); omitted means their default delivery address.</param>
public record CreateQuoteRequest(List<QuoteLineItemRequest> LineItems, Guid? DeliveryAddressKey = null);
