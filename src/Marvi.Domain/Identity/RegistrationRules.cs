using System.Net.Mail;
using System.Text;

namespace Marvi.Domain.Identity;

/// <summary>The registration data as it arrives (registration, profile, admin edit), before <see cref="RegistrationRules.Check"/>.</summary>
public sealed record RegistrationInput(
    string? Phone = null,
    string? InvoiceEmail = null,
    string? Cnpj = null,
    string? LegalName = null,
    string? TradeName = null,
    StateRegistrationStatus? StateRegistrationStatus = null,
    string? StateRegistration = null,
    string? MunicipalRegistration = null,
    string? MainCnae = null,
    TaxRegime? TaxRegime = null,
    DateOnly? OpeningDate = null,
    string? ContactName = null,
    string? Cpf = null,
    DateOnly? BirthDate = null);

/// <summary>Registration data that has passed <see cref="RegistrationRules.Check"/>: trimmed, normalised (digits only for phone, CNAE and CPF; upper-case CNPJ and IE). <c>Cpf</c> is null when the CPF was left to stay as stored.</summary>
public sealed record RegistrationData(
    string? Phone,
    string? InvoiceEmail,
    string? Cnpj,
    string? LegalName,
    string? TradeName,
    StateRegistrationStatus? StateRegistrationStatus,
    string? StateRegistration,
    string? MunicipalRegistration,
    string? MainCnae,
    TaxRegime? TaxRegime,
    DateOnly? OpeningDate,
    string? ContactName,
    string? Cpf,
    DateOnly? BirthDate);

/// <summary>One thing wrong with the registration data: the field (its API name) and a pt-BR message that names it.</summary>
public sealed record RegistrationProblem(string Field, string Message);

/// <summary>
/// The one definition of what a customer's registration data may be (MRV-9.4), for registration, the customer's own profile and the admin's edit.
/// A business account carries the company fields and no CPF or birth date; a personal account the CPF (required) and a birth date (18 or older,
/// required) and none of the company fields. Everything else is optional: completeness is shown to staff, it does not block anything.
/// Structural checks only: no call to any government registry.
/// </summary>
public static class RegistrationRules
{
    public const int MaxNameLength = 200;
    public const int MaxContactNameLength = 120;
    public const int MaxMunicipalRegistrationLength = 30;
    public const int MaxEmailLength = 200;
    public const int MaxTypedPhoneLength = 30;
    public const int MinAdultAge = 18;
    public static readonly DateOnly EarliestDate = new(1900, 1, 1);

    /// <summary>The API names of the fields a complete record has, per account type, in the order the profile shows them.</summary>
    public static IReadOnlyList<string> RequiredFields(AccountType type) => type == AccountType.Business
        ? ["cnpj", "legalName", "stateRegistrationStatus", "stateRegistration", "municipalRegistration", "mainCnae", "taxRegime", "openingDate", "invoiceEmail", "phone", "contactName"]
        : ["cpf", "birthDate", "phone", "invoiceEmail"];

    /// <param name="existingCpf">True when the account already has a CPF: leaving it out then keeps it (the screens never show the full number back).</param>
    public static (RegistrationData? Data, IReadOnlyList<RegistrationProblem> Problems) Check(AccountType type, RegistrationInput? input, DateOnly today, bool existingCpf = false)
    {
        input ??= new RegistrationInput();
        var problems = new List<RegistrationProblem>();
        void Fail(string field, string message) => problems.Add(new RegistrationProblem(field, message));

        // Common fields.
        var phone = Clean(input.Phone);
        string? phoneDigits = null;
        if (phone is not null)
        {
            phoneDigits = new string(phone.Where(char.IsAsciiDigit).ToArray());
            if (phone.Length > MaxTypedPhoneLength || phone.Any(c => !(char.IsAsciiDigit(c) || c is ' ' or '(' or ')' or '-' or '+' or '.')) || phoneDigits.Length is < 10 or > 11)
            {
                Fail("phone", "Telefone inválido: informe o DDD e o número (10 ou 11 dígitos).");
            }
        }

        var invoiceEmail = Clean(input.InvoiceEmail);
        if (invoiceEmail is not null && !IsEmail(invoiceEmail))
        {
            Fail("invoiceEmail", "E-mail para nota fiscal inválido.");
        }

        var texts = new[] { input.LegalName, input.TradeName, input.MunicipalRegistration, input.ContactName, input.StateRegistration, input.MainCnae, input.Cnpj, input.Cpf, input.InvoiceEmail };
        if (texts.Any(t => t is not null && ContainsInvisible(t)))
        {
            Fail("registration", "Os dados cadastrais não podem ter caracteres de controle, quebras de linha nem caracteres invisíveis ou de direção do texto.");
        }

        string? cnpj = null, legalName = null, tradeName = null, ie = null, municipal = null, cnae = null, contact = null, cpf = null;
        DateOnly? opening = null, birth = null;

        if (type == AccountType.Business)
        {
            if (Clean(input.Cpf) is not null || input.BirthDate is not null)
            {
                Fail("cpf", "Uma conta empresarial não tem CPF nem data de nascimento.");
            }

            cnpj = CnpjRules.Normalize(Clean(input.Cnpj));
            if (cnpj is not null && !CnpjRules.IsValid(cnpj))
            {
                Fail("cnpj", "CNPJ inválido: confira os 14 caracteres e os dois dígitos verificadores.");
            }

            legalName = Limited(input.LegalName, MaxNameLength, "legalName", "Razão social", Fail);
            tradeName = Limited(input.TradeName, MaxNameLength, "tradeName", "Nome fantasia", Fail);
            municipal = Limited(input.MunicipalRegistration, MaxMunicipalRegistrationLength, "municipalRegistration", "Inscrição municipal", Fail);
            contact = Limited(input.ContactName, MaxContactNameLength, "contactName", "Responsável", Fail);

            ie = Strip(Clean(input.StateRegistration))?.ToUpperInvariant();
            if (input.StateRegistrationStatus == StateRegistrationStatus.Contributor)
            {
                if (ie is null)
                {
                    Fail("stateRegistration", "Inscrição estadual obrigatória para contribuinte do ICMS.");
                }
            }
            else if (ie is not null)
            {
                Fail("stateRegistration", "Inscrição estadual só pode ser informada para contribuinte do ICMS.");
            }

            if (ie is not null && (ie.Length is < 2 or > 14 || !ie.All(c => char.IsAsciiDigit(c) || char.IsAsciiLetterUpper(c))))
            {
                Fail("stateRegistration", "Inscrição estadual inválida: use de 2 a 14 letras ou números.");
            }

            cnae = Strip(Clean(input.MainCnae));
            if (cnae is not null && (cnae.Length != 7 || !cnae.All(char.IsAsciiDigit)))
            {
                Fail("mainCnae", "CNAE principal inválido: são 7 dígitos.");
            }

            opening = input.OpeningDate;
            if (opening is { } date && (date > today || date < EarliestDate))
            {
                Fail("openingDate", "Data de abertura inválida: não pode ser futura nem anterior a 1900.");
            }
        }
        else
        {
            if (new[] { input.Cnpj, input.LegalName, input.TradeName, input.StateRegistration, input.MunicipalRegistration, input.MainCnae, input.ContactName }.Any(t => Clean(t) is not null)
                || input.StateRegistrationStatus is not null || input.TaxRegime is not null || input.OpeningDate is not null)
            {
                Fail("registration", "Uma conta pessoal não tem dados de empresa (CNPJ, razão social, inscrições, CNAE, regime, abertura, responsável).");
            }

            var typedCpf = CpfRules.Normalize(Clean(input.Cpf));
            if (typedCpf is null)
            {
                if (!existingCpf)
                {
                    Fail("cpf", "CPF obrigatório para conta pessoal.");
                }
            }
            else if (!CpfRules.IsValid(typedCpf))
            {
                Fail("cpf", "CPF inválido: confira os 11 dígitos e os dois dígitos verificadores.");
            }
            else
            {
                cpf = typedCpf;
            }

            birth = input.BirthDate;
            if (birth is null)
            {
                Fail("birthDate", "Data de nascimento obrigatória para conta pessoal.");
            }
            else if (birth.Value < EarliestDate || birth.Value > today)
            {
                Fail("birthDate", "Data de nascimento inválida.");
            }
            else if (!IsAdult(birth.Value, today))
            {
                Fail("birthDate", "Data de nascimento: é preciso ter 18 anos ou mais. A venda de bebidas alcoólicas é proibida para menores de 18 anos.");
            }
        }

        if (problems.Count > 0)
        {
            return (null, problems);
        }

        return (new RegistrationData(
            phoneDigits, invoiceEmail, cnpj, legalName, tradeName,
            type == AccountType.Business ? input.StateRegistrationStatus : null, ie, municipal, cnae,
            type == AccountType.Business ? input.TaxRegime : null, opening, contact, cpf, birth), problems);
    }

    /// <summary>True when the person born on <paramref name="birth"/> is at least 18 years old on <paramref name="today"/> (exactly 18 today counts).</summary>
    public static bool IsAdult(DateOnly birth, DateOnly today) => birth <= today.AddYears(-MinAdultAge);

    /// <summary>The fields of a complete record that are still empty, by API name (for the staff completeness indicator). <paramref name="hasCpf"/> says whether a CPF is stored.</summary>
    public static IReadOnlyList<string> Missing(ClientAccount account, bool hasCpf)
    {
        bool Empty(string field) => field switch
        {
            "cnpj" => account.Cnpj is null,
            "legalName" => account.LegalName is null,
            "stateRegistrationStatus" => account.StateRegistrationStatus is null,
            // Only a contributor has one to give.
            "stateRegistration" => account.StateRegistrationStatus == StateRegistrationStatus.Contributor && account.StateRegistration is null,
            "municipalRegistration" => account.MunicipalRegistration is null,
            "mainCnae" => account.MainCnae is null,
            "taxRegime" => account.TaxRegime is null,
            "openingDate" => account.OpeningDate is null,
            "invoiceEmail" => account.InvoiceEmail is null,
            "phone" => account.Phone is null,
            "contactName" => account.ContactName is null,
            "cpf" => !hasCpf,
            "birthDate" => account.BirthDate is null,
            _ => false,
        };

        return RequiredFields(account.AccountType).Where(Empty).ToList();
    }

    /// <summary>
    /// A control character, a line or paragraph separator, or a Unicode format character (category Cf: zero-width, bidirectional override, byte-order mark):
    /// none of them belongs in a name or an identifier, and the invisible ones make two different texts look the same on screen.
    /// </summary>
    public static bool ContainsInvisible(string text) =>
        text.EnumerateRunes().Any(rune => Rune.IsControl(rune) || Rune.GetUnicodeCategory(rune) is System.Globalization.UnicodeCategory.Format
            or System.Globalization.UnicodeCategory.LineSeparator or System.Globalization.UnicodeCategory.ParagraphSeparator);

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static string? Strip(string? text) => text?.Replace(".", "").Replace("-", "").Replace("/", "").Replace(" ", "");

    private static string? Limited(string? text, int max, string field, string label, Action<string, string> fail)
    {
        var cleaned = Clean(text);
        if (cleaned is not null && cleaned.Length > max)
        {
            fail(field, $"{label}: no máximo {max} caracteres.");
        }

        return cleaned;
    }

    private static bool IsEmail(string email) =>
        email.Length <= MaxEmailLength && MailAddress.TryCreate(email, out var parsed) && parsed.Address == email && parsed.Host.Contains('.');
}
