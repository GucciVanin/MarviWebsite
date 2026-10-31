using Marvi.Domain.Identity;

namespace Marvi.Tests.Identity;

/// <summary>MRV-2.2 / MRV-9.3: what a customer's company name may be, at the pure Domain seam (addresses: ClientAddressRulesTests).</summary>
public class ClientProfileRulesTests
{
    [Fact]
    public void AValidName_IsTrimmed()
    {
        var (profile, problem) = ClientProfileRules.Check("  Acme  ");

        Assert.Null(problem);
        Assert.Equal("Acme", profile!.CompanyName);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void TheCompanyName_IsRequired(string? company) =>
        Assert.Equal("Company name is required.", ClientProfileRules.Check(company).Problem);

    [Fact]
    public void TheLimit_IsTheRegistrationsLimit()
    {
        Assert.NotNull(ClientProfileRules.Check(new string('c', 201)).Problem);
        Assert.Null(ClientProfileRules.Check(new string('c', 200)).Problem);
    }

    [Theory]
    [InlineData("Ac\u0000me")]
    [InlineData("Ac\nme")]
    public void ControlCharacters_AreRefused(string company) =>
        Assert.NotNull(ClientProfileRules.Check(company).Problem);
}
