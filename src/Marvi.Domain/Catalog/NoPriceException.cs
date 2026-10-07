namespace Marvi.Domain.Catalog;

/// <summary>
/// No price row exists for a product and pricing tier. A subtype of <see cref="InvalidOperationException"/> so existing
/// callers that catch the base type keep working, while the public catalog can catch exactly this case (and show "on
/// request") without also hiding unrelated pricing bugs.
/// </summary>
public class NoPriceException : InvalidOperationException
{
    public NoPriceException(string message) : base(message)
    {
    }
}
