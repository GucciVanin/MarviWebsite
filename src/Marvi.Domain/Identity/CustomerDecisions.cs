namespace Marvi.Domain.Identity;

/// <summary>
/// The decisions an admin takes about a Customer (MRV-6.1). A new Customer is Pending and stays so until an admin approves or
/// suspends them; each decision is taken once, so two admins acting on the same Customer cannot both "win".
/// Pending or Suspended -> Approved; Pending or Approved -> Suspended.
/// </summary>
public static class CustomerDecisions
{
    public static bool CanApprove(ClientAccountStatus status) => status != ClientAccountStatus.Approved;

    public static bool CanSuspend(ClientAccountStatus status) => status != ClientAccountStatus.Suspended;
}
