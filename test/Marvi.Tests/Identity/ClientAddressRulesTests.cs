using Marvi.Domain.Identity;

namespace Marvi.Tests.Identity;

/// <summary>MRV-9.3 AC-3: what a customer's address may be, at the pure Domain seam.</summary>
public class ClientAddressRulesTests
{
    private static ClientAddressInput Valid(
        string? label = "Matriz", ClientAddressKind? kind = ClientAddressKind.Both, string? cep = "01001-000", string? street = "Praça da Sé", string? number = "10",
        string? complement = null, string? district = "Sé", string? city = "São Paulo", string? state = "SP", string? notes = null) =>
        new(label, kind, cep, street, number, complement, district, city, state, notes);

    [Fact]
    public void AValidAddress_IsTrimmed_TheCepIsEightDigits_AndTheUfUpperCase()
    {
        var (address, problem) = ClientAddressRules.Check(Valid(label: "  Matriz ", cep: " 01001-000 ", street: " Praça da Sé ", state: "sp", complement: "  ", notes: " portão azul "));

        Assert.Null(problem);
        Assert.Equal("Matriz", address!.Label);
        Assert.Equal("01001000", address.PostalCode);
        Assert.Equal("Praça da Sé", address.Street);
        Assert.Equal("SP", address.State);
        Assert.Null(address.Complement);
        Assert.Equal("portão azul", address.DeliveryNotes);
    }

    [Fact]
    public void SemNumero_IsAllowedAsTheNumber() =>
        Assert.Equal("s/n", ClientAddressRules.Check(Valid(number: "s/n")).Address!.Number);

    [Theory]
    [InlineData("label")]
    [InlineData("cep")]
    [InlineData("street")]
    [InlineData("number")]
    [InlineData("district")]
    [InlineData("city")]
    [InlineData("state")]
    public void EachRequiredPart_IsRequired(string missing)
    {
        var input = Valid(
            label: missing == "label" ? " " : "Matriz", cep: missing == "cep" ? "" : "01001000", street: missing == "street" ? null : "Rua A", number: missing == "number" ? "" : "1",
            district: missing == "district" ? "  " : "Centro", city: missing == "city" ? null : "Campinas", state: missing == "state" ? "" : "SP");

        Assert.Equal("Label, type, postal code, street, number, district, city and state are required.", ClientAddressRules.Check(input).Problem);
    }

    [Fact]
    public void TheType_IsRequired_UnlessADefaultIsGiven()
    {
        Assert.NotNull(ClientAddressRules.Check(Valid(kind: null)).Problem);
        Assert.Equal(ClientAddressKind.Both, ClientAddressRules.Check(Valid(kind: null), defaultKind: ClientAddressKind.Both).Address!.Kind);
        Assert.Equal("Endereço principal", ClientAddressRules.Check(Valid(label: null), ClientAddressRules.DefaultLabel).Address!.Label);
        Assert.NotNull(ClientAddressRules.Check(Valid(kind: (ClientAddressKind)9)).Problem);
    }

    [Theory]
    [InlineData("0100100")]
    [InlineData("010010000")]
    [InlineData("0100100a")]
    [InlineData("abcdefgh")]
    public void TheCep_MustBeExactlyEightDigits(string cep) =>
        Assert.Equal("The postal code (CEP) must have 8 digits.", ClientAddressRules.Check(Valid(cep: cep)).Problem);

    [Theory]
    [InlineData("01001-000")]
    [InlineData("01001000")]
    [InlineData("01001 000")]
    [InlineData(" 01001 - 000 ")]
    [InlineData("0100-1-000")]
    public void TheCep_AcceptsSpacesAndDashes_AndIsNormalisedToEightDigits(string cep)
    {
        var (address, problem) = ClientAddressRules.Check(Valid(cep: cep));

        Assert.Null(problem);
        Assert.Equal("01001000", address!.PostalCode);
    }

    [Theory]
    [InlineData("XX")]
    [InlineData("S")]
    [InlineData("SPP")]
    public void TheUf_MustBeOneOfThe27(string uf) =>
        Assert.Equal("Unknown state (UF).", ClientAddressRules.Check(Valid(state: uf)).Problem);

    [Fact]
    public void Exactly27States_AreKnown()
    {
        Assert.Equal(27, ClientAddressRules.States.Count);
        Assert.Equal(27, ClientAddressRules.States.Distinct().Count());
        Assert.All(ClientAddressRules.States, uf => Assert.Null(ClientAddressRules.Check(Valid(state: uf)).Problem));
    }

    [Fact]
    public void Lengths_AreBounded_AtTheirLimitsExactly()
    {
        Assert.Null(ClientAddressRules.Check(Valid(label: new string('l', 60), street: new string('s', 200), number: new string('n', 20), complement: new string('c', 100),
            district: new string('d', 100), city: new string('y', 100), notes: new string('o', 300))).Problem);

        Assert.NotNull(ClientAddressRules.Check(Valid(label: new string('l', 61))).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(street: new string('s', 201))).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(number: new string('n', 21))).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(complement: new string('c', 101))).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(district: new string('d', 101))).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(city: new string('y', 101))).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(notes: new string('o', 301))).Problem);
    }

    [Theory]
    [InlineData("Ma\u0000triz")]
    [InlineData("Ma\ntriz")]
    public void ControlCharactersAndLineBreaks_AreRefused_InAnyField(string text)
    {
        Assert.Equal("Addresses cannot contain control characters or line breaks.", ClientAddressRules.Check(Valid(label: text)).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(street: text)).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(notes: text)).Problem);
        Assert.NotNull(ClientAddressRules.Check(Valid(complement: text)).Problem);
    }

    [Fact]
    public void LineSeparators_AndInvisibleFormatCharacters_AreRefused()
    {
        foreach (var code in new[] { 0x2028, 0x2029, 0x200B, 0x202E })
        {
            var text = "Ma" + (char)code + "triz";
            Assert.NotNull(ClientAddressRules.Check(Valid(label: text)).Problem);
            Assert.NotNull(ClientAddressRules.Check(Valid(notes: text)).Problem);
        }
    }

    [Fact]
    public void NoAddress_IsAProblem() => Assert.NotNull(ClientAddressRules.Check(null).Problem);

    [Fact]
    public void TheSamePlace_IsSameCepNumberAndComplement_IgnoringCaseAndAccents()
    {
        var saved = new ClientAddress { PostalCode = "01001000", Number = "10", Complement = "Sálá 2" };
        ClientAddressData Candidate(string cep, string number, string? complement) =>
            ClientAddressRules.Check(Valid(cep: cep, number: number, complement: complement)).Address!;

        Assert.True(ClientAddressRules.IsSamePlace(Candidate("01001-000", "10", "SALA 2 "), saved));
        Assert.False(ClientAddressRules.IsSamePlace(Candidate("01001-001", "10", "Sálá 2"), saved));
        Assert.False(ClientAddressRules.IsSamePlace(Candidate("01001-000", "11", "Sálá 2"), saved));
        Assert.False(ClientAddressRules.IsSamePlace(Candidate("01001-000", "10", null), saved));
        Assert.True(ClientAddressRules.IsSamePlace(Candidate("01001-000", "10", null), new ClientAddress { PostalCode = "01001000", Number = "10", Complement = "" }));
    }

    [Theory]
    [InlineData(ClientAddressKind.Billing, true, false)]
    [InlineData(ClientAddressKind.Delivery, false, true)]
    [InlineData(ClientAddressKind.Both, true, true)]
    public void TheType_SaysWhatTheAddressCanBe(ClientAddressKind kind, bool bills, bool delivers)
    {
        Assert.Equal(bills, ClientAddressRules.CanBill(kind));
        Assert.Equal(delivers, ClientAddressRules.CanDeliver(kind));
    }
}
