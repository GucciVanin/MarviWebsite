using Marvi.Domain.Identity;

namespace Marvi.Tests.Identity;

/// <summary>MRV-6.1: which decisions an admin may take about a customer, at the pure Domain seam.</summary>
public class CustomerDecisionsTests
{
    [Theory]
    [InlineData(ClientAccountStatus.Pending, true)]
    [InlineData(ClientAccountStatus.Suspended, true)]
    [InlineData(ClientAccountStatus.Approved, false)]
    public void ACustomerCanBeApproved_UnlessAlreadyApproved(ClientAccountStatus status, bool allowed) =>
        Assert.Equal(allowed, CustomerDecisions.CanApprove(status));

    [Theory]
    [InlineData(ClientAccountStatus.Pending, true)]
    [InlineData(ClientAccountStatus.Approved, true)]
    [InlineData(ClientAccountStatus.Suspended, false)]
    public void ACustomerCanBeSuspended_UnlessAlreadySuspended(ClientAccountStatus status, bool allowed) =>
        Assert.Equal(allowed, CustomerDecisions.CanSuspend(status));
}
