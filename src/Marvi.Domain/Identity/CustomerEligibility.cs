namespace Marvi.Domain.Identity;

/// <summary>
/// Customer eligibility (CONTEXT.md): whether a Customer may request a quote, accept one, or have an order placed for them.
/// The only place that decides it, so quotes and orders can never disagree.
/// </summary>
public static class CustomerEligibility
{
    public static bool IsEligible(ClientAccountStatus status) => status == ClientAccountStatus.Approved;
}
