using Marvi.Domain.Identity;

namespace Marvi.Tests.Identity;

/// <summary>MRV-2.2: what a customer's company details may be, at the pure Domain seam.</summary>
public class ClientProfileRulesTests
{
    [Fact]
    public void ValidDetails_AreTrimmed()
    {
        var (profile, problem) = ClientProfileRules.Check("  Acme  ", " Rua A, 1 ", ["  Rua B, 2 "]);

        Assert.Null(problem);
        Assert.Equal("Acme", profile!.CompanyName);
        Assert.Equal("Rua A, 1", profile.BillingAddress);
        Assert.Equal(["Rua B, 2"], profile.ShippingAddresses);
    }

    [Theory]
    [InlineData(null, "Rua A")]
    [InlineData("  ", "Rua A")]
    [InlineData("Acme", "")]
    [InlineData("Acme", null)]
    public void CompanyAndBillingAddress_AreRequired(string? company, string? billing)
    {
        Assert.Equal("Company name and billing address are required.", ClientProfileRules.Check(company, billing).Problem);
    }

    [Fact]
    public void Limits_AreTheRegistrationsLimits()
    {
        Assert.NotNull(ClientProfileRules.Check(new string('c', 201), "Rua A").Problem);
        Assert.NotNull(ClientProfileRules.Check("Acme", new string('a', 501)).Problem);
        Assert.Null(ClientProfileRules.Check(new string('c', 200), new string('a', 500)).Problem);
    }

    [Theory]
    [InlineData("Ac\u0000me", "Rua A", "Rua B")]
    [InlineData("Acme", "Rua\nA", "Rua B")]
    [InlineData("Acme", "Rua A", "Rua B\nApto 3")]
    [InlineData("Acme", "Rua A", "Rua\tB")]
    public void ControlCharactersAndLineBreaks_AreRefused_EverywhereInTheDetails(string company, string billing, string shipping)
    {
        var (profile, problem) = ClientProfileRules.Check(company, billing, [shipping]);

        Assert.Null(profile);
        Assert.Contains("control characters", problem);
    }

    [Fact]
    public void ShippingAddresses_DropBlanksAndRepeats_KeepingTheFirstAndTheOrder()
    {
        var (profile, _) = ClientProfileRules.Check("Acme", "Rua A", ["Rua B", "  ", null, "rua b", "Rua C", "Rua B "]);

        Assert.Equal(["Rua B", "Rua C"], profile!.ShippingAddresses);
    }

    [Fact]
    public void ShippingAddresses_AreOptional_Bounded_AndEachLimited()
    {
        Assert.Empty(ClientProfileRules.Check("Acme", "Rua A", null).Profile!.ShippingAddresses);
        Assert.Null(ClientProfileRules.Check("Acme", "Rua A", Enumerable.Range(1, 10).Select(i => $"Rua {i}")).Problem);
        Assert.Contains("At most 10", ClientProfileRules.Check("Acme", "Rua A", Enumerable.Range(1, 11).Select(i => $"Rua {i}")).Problem);
        Assert.Contains("Each shipping address", ClientProfileRules.Check("Acme", "Rua A", [new string('x', 501)]).Problem);
    }
}
