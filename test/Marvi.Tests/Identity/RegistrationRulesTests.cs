using Marvi.Domain.Identity;

namespace Marvi.Tests.Identity;

/// <summary>MRV-9.4 AC-2: CNPJ and CPF at the pure Domain seam, and the registration data of each account type.</summary>
public class RegistrationRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 30);

    // ---- CNPJ ----

    [Theory]
    [InlineData("11.222.333/0001-81")]
    [InlineData("11444777000161")]
    [InlineData("00.000.000/0001-91")]
    [InlineData("12.ABC.345/01DE-35")] // the Receita Federal's published alphanumeric example
    [InlineData("12abc34501de35")] // lower case is normalised
    public void KnownValidCnpjs_AreAccepted(string typed) => Assert.True(CnpjRules.IsValid(CnpjRules.Normalize(typed)));

    [Theory]
    [InlineData("11222333000182")] // wrong second digit
    [InlineData("11222333000171")] // wrong first digit
    [InlineData("12ABC34501DE3A")] // a letter in a check position
    [InlineData("12ABC34501DEAA")]
    [InlineData("00000000000000")] // repeated digits
    [InlineData("11111111111111")]
    [InlineData("1122233300018")] // 13
    [InlineData("112223330001811")] // 15
    [InlineData("12ABC34501D!35")] // a symbol in the body
    [InlineData("")]
    public void WrongCnpjs_AreRefused(string typed) => Assert.False(CnpjRules.IsValid(CnpjRules.Normalize(typed)));

    [Fact]
    public void TheReceitaWorkedExample_GivesTheDigits3And5() => Assert.Equal("35", CnpjRules.CheckDigits("12ABC34501DE"));

    [Fact]
    public void ACnpjIsAHeadOfficeOnlyWhenTheOrderIs0001()
    {
        Assert.True(CnpjRules.IsHeadOffice("11222333000181"));
        Assert.False(CnpjRules.IsHeadOffice("11222333000262"));
        Assert.Equal("11.222.333/0001-81", CnpjRules.Format("11222333000181"));
    }

    // ---- CPF ----

    [Theory]
    [InlineData("111.444.777-35")]
    [InlineData("52998224725")]
    [InlineData("280.012.389-38")]
    public void ValidCpfs_AreAccepted(string typed) => Assert.True(CpfRules.IsValid(CpfRules.Normalize(typed)));

    [Theory]
    [InlineData("111.444.777-36")]
    [InlineData("11111111111")]
    [InlineData("00000000000")]
    [InlineData("1114447773")]
    [InlineData("111444777355")]
    [InlineData("1114447773A")]
    public void InvalidCpfs_AreRefused(string typed) => Assert.False(CpfRules.IsValid(CpfRules.Normalize(typed)));

    [Fact]
    public void TheCpfMaskShowsOnlyTheMiddleSixDigits()
    {
        Assert.Equal("***.444.777-**", CpfRules.Mask("11144477735"));
        Assert.Equal("111.444.777-35", CpfRules.Format("11144477735"));
        Assert.DoesNotContain("11144477735", CpfRules.Mask("11144477735"));
    }

    // ---- Age ----

    [Fact]
    public void ABirthDateOfExactly18Today_IsAdult_AndOneDayShortIsNot()
    {
        Assert.True(RegistrationRules.IsAdult(new DateOnly(2008, 10, 30), Today));
        Assert.False(RegistrationRules.IsAdult(new DateOnly(2008, 10, 31), Today));
    }

    [Fact]
    public void ALeapDayBirthday_IsAdultOnlyFrom1March_TheConservativeDayInANonLeapYear()
    {
        Assert.False(RegistrationRules.IsAdult(new DateOnly(2008, 2, 29), new DateOnly(2026, 2, 28)));
        Assert.True(RegistrationRules.IsAdult(new DateOnly(2008, 2, 29), new DateOnly(2026, 3, 1)));
    }

    // ---- Business ----

    private static string Problem(IReadOnlyList<RegistrationProblem> problems, string field) => problems.Single(p => p.Field == field).Message;

    [Fact]
    public void ABusinessWithNothingElseIsAccepted_AndNothingIsRequired()
    {
        var (data, problems) = RegistrationRules.Check(AccountType.Business, new RegistrationInput(), Today);
        Assert.Empty(problems);
        Assert.Null(data!.Cnpj);
    }

    [Fact]
    public void ABusinessIsNormalised()
    {
        var (data, problems) = RegistrationRules.Check(AccountType.Business, new RegistrationInput(
            Phone: "(11) 91234-5678", InvoiceEmail: " nfe@acme.com.br ", Cnpj: "11.222.333/0001-81", LegalName: " Acme Ltda ", TradeName: " Acme ",
            StateRegistrationStatus: StateRegistrationStatus.Contributor, StateRegistration: "110.042.490.114", MunicipalRegistration: " 123 ", MainCnae: "46.34-6-01",
            TaxRegime: TaxRegime.SimplesNacional, OpeningDate: new DateOnly(2010, 5, 4), ContactName: " Ana "), Today);

        Assert.Empty(problems);
        Assert.Equal("11912345678", data!.Phone);
        Assert.Equal("nfe@acme.com.br", data.InvoiceEmail);
        Assert.Equal("11222333000181", data.Cnpj);
        Assert.Equal("Acme Ltda", data.LegalName);
        Assert.Equal("110042490114", data.StateRegistration);
        Assert.Equal("4634601", data.MainCnae);
        Assert.Equal("Ana", data.ContactName);
    }

    [Theory]
    [InlineData("cnpj")]
    [InlineData("phone")]
    [InlineData("invoiceEmail")]
    [InlineData("mainCnae")]
    [InlineData("openingDate")]
    [InlineData("stateRegistration")]
    [InlineData("legalName")]
    public void EachBusinessFieldIsValidated_AndNamed(string field)
    {
        var input = field switch
        {
            "cnpj" => new RegistrationInput(Cnpj: "11222333000182"),
            "phone" => new RegistrationInput(Phone: "12345"),
            "invoiceEmail" => new RegistrationInput(InvoiceEmail: "not-an-email"),
            "mainCnae" => new RegistrationInput(MainCnae: "123"),
            "openingDate" => new RegistrationInput(OpeningDate: Today.AddDays(1)),
            "stateRegistration" => new RegistrationInput(StateRegistrationStatus: StateRegistrationStatus.Contributor),
            _ => new RegistrationInput(LegalName: new string('x', 201)),
        };

        var (data, problems) = RegistrationRules.Check(AccountType.Business, input, Today);
        Assert.Null(data);
        Assert.NotEmpty(Problem(problems, field));
    }

    [Fact]
    public void TheStateRegistrationIsRequiredForAContributor_AndForbiddenOtherwise()
    {
        Assert.Equal("stateRegistration", RegistrationRules.Check(AccountType.Business,
            new RegistrationInput(StateRegistrationStatus: StateRegistrationStatus.Exempt, StateRegistration: "123456"), Today).Problems.Single().Field);
        Assert.Equal("stateRegistration", RegistrationRules.Check(AccountType.Business,
            new RegistrationInput(StateRegistrationStatus: StateRegistrationStatus.Contributor, StateRegistration: "1"), Today).Problems.Single().Field);
        Assert.Empty(RegistrationRules.Check(AccountType.Business,
            new RegistrationInput(StateRegistrationStatus: StateRegistrationStatus.Exempt), Today).Problems);
    }

    [Fact]
    public void ABusinessCannotCarryACpfOrABirthDate()
    {
        Assert.Equal("cpf", RegistrationRules.Check(AccountType.Business, new RegistrationInput(Cpf: "11144477735"), Today).Problems.Single().Field);
        Assert.Equal("cpf", RegistrationRules.Check(AccountType.Business, new RegistrationInput(BirthDate: new DateOnly(1980, 1, 1)), Today).Problems.Single().Field);
    }

    // ---- Personal ----

    [Fact]
    public void APersonalAccountNeedsACpfAndABirthDate()
    {
        var (data, problems) = RegistrationRules.Check(AccountType.Personal, new RegistrationInput(), Today);
        Assert.Null(data);
        Assert.Equal(["cpf", "birthDate"], problems.Select(p => p.Field));
    }

    [Fact]
    public void APersonalAccountIsNormalised()
    {
        var (data, problems) = RegistrationRules.Check(AccountType.Personal, new RegistrationInput(Cpf: "111.444.777-35", BirthDate: new DateOnly(1990, 3, 2), Phone: "11 3333-4444"), Today);
        Assert.Empty(problems);
        Assert.Equal("11144477735", data!.Cpf);
        Assert.Equal("1133334444", data.Phone);
    }

    [Fact]
    public void ALeftOutCpfIsFine_OnlyWhenOneIsAlreadyStored()
    {
        var input = new RegistrationInput(BirthDate: new DateOnly(1990, 3, 2));
        Assert.Equal("cpf", RegistrationRules.Check(AccountType.Personal, input, Today).Problems.Single().Field);
        var (data, problems) = RegistrationRules.Check(AccountType.Personal, input, Today, existingCpf: true);
        Assert.Empty(problems);
        Assert.Null(data!.Cpf);
    }

    [Fact]
    public void AnInvalidCpf_IsNamed() =>
        Assert.Contains("CPF", Problem(RegistrationRules.Check(AccountType.Personal, new RegistrationInput(Cpf: "11144477736", BirthDate: new DateOnly(1990, 1, 1)), Today).Problems, "cpf"));

    [Fact]
    public void UnderEighteen_IsRefused_WithTheAgeRuleExplained()
    {
        var (data, problems) = RegistrationRules.Check(AccountType.Personal, new RegistrationInput(Cpf: "11144477735", BirthDate: new DateOnly(2008, 10, 31)), Today);
        Assert.Null(data);
        Assert.Contains("18 anos", Problem(problems, "birthDate"));
        Assert.Contains("bebidas alcoólicas", Problem(problems, "birthDate"));
    }

    [Fact]
    public void ExactlyEighteenToday_IsAccepted() =>
        Assert.Empty(RegistrationRules.Check(AccountType.Personal, new RegistrationInput(Cpf: "11144477735", BirthDate: new DateOnly(2008, 10, 30)), Today).Problems);

    [Theory]
    [InlineData(1899, 12, 31)]
    [InlineData(2026, 10, 31)]
    public void ABirthDateBefore1900OrInTheFuture_IsRefused(int year, int month, int day) =>
        Assert.Equal("birthDate", RegistrationRules.Check(AccountType.Personal, new RegistrationInput(Cpf: "11144477735", BirthDate: new DateOnly(year, month, day)), Today).Problems.Single().Field);

    [Fact]
    public void APersonalAccountCannotCarryCompanyFields() =>
        Assert.Equal("registration", RegistrationRules.Check(AccountType.Personal, new RegistrationInput(Cnpj: "11222333000181", Cpf: "11144477735", BirthDate: new DateOnly(1990, 1, 1)), Today).Problems.Single().Field);

    // ---- Completeness ----

    [Fact]
    public void Completeness_ListsWhatIsStillEmpty_ByAccountType()
    {
        var business = new ClientAccount { AccountType = AccountType.Business, Cnpj = "11222333000181", StateRegistrationStatus = StateRegistrationStatus.Exempt };
        var missing = RegistrationRules.Missing(business, hasCpf: false);
        Assert.DoesNotContain("cnpj", missing);
        Assert.DoesNotContain("stateRegistration", missing); // an exempt company has none to give
        Assert.Contains("legalName", missing);

        var person = new ClientAccount { AccountType = AccountType.Personal, BirthDate = new DateOnly(1990, 1, 1), Phone = "11912345678", InvoiceEmail = "a@b.com" };
        Assert.Equal(["cpf"], RegistrationRules.Missing(person, hasCpf: false));
        Assert.Empty(RegistrationRules.Missing(person, hasCpf: true));
    }
}
