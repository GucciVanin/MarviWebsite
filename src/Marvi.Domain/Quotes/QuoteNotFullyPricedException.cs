namespace Marvi.Domain.Quotes;

/// <summary>
/// A quote reached acceptance with a line that has no final price. A subtype of <see cref="InvalidOperationException"/>
/// so callers that catch the base type still work, while the API can answer 409 instead of creating a free order.
/// </summary>
public class QuoteNotFullyPricedException : InvalidOperationException
{
    public QuoteNotFullyPricedException(string message) : base(message)
    {
    }
}
