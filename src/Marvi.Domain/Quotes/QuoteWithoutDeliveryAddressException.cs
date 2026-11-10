namespace Marvi.Domain.Quotes;

/// <summary>
/// A quote reached acceptance without a delivery address (a quote made before MRV-9.6): an order never has an empty address, so the customer
/// must choose one first. A subtype of <see cref="InvalidOperationException"/>; the API answers 409 with this message.
/// </summary>
public class QuoteWithoutDeliveryAddressException : InvalidOperationException
{
    public const string DefaultMessage = "Escolha o endereço de entrega antes de aceitar o orçamento.";

    public QuoteWithoutDeliveryAddressException() : base(DefaultMessage)
    {
    }
}
