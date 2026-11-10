using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

/// <summary>A customer's display name and registration data that passed the rules (MRV-9.4), ready to be applied to the account.</summary>
public sealed record PreparedRegistration(AccountType Type, string DisplayName, RegistrationData Data);

/// <summary>
/// The one place a customer's registration data is checked, compared with the stored record and written (MRV-9.4), for registration, the customer's
/// own profile and the admin's edit. It owns the CPF handling: encrypted storage with a keyed hash, never returned or logged in the clear.
/// </summary>
public class ClientRegistrationService
{
    public const string LockedMessage = "Seu cadastro já foi verificado e só pode ser alterado pela empresa. Entre em contato para pedir a mudança.";
    /// <summary>
    /// The one answer when the CNPJ or the CPF is already used (registration, the customer's profile, the admin's edit). It is the same for both and says
    /// nothing about which one or whose, so it cannot be used to find out whether a person or a company is a customer (MRV-9.4 security review).
    /// The unique indexes stay: they are what makes it true.
    /// </summary>
    public const string DuplicateMessage = "Não foi possível concluir o cadastro com estes dados. Se você já tem conta, entre ou fale conosco.";

    /// <summary>The names of the unique indexes behind the duplicate answer; any other constraint failure is not a duplicate.</summary>
    public static readonly string[] DuplicateIndexes = ["ix_client_accounts_cnpj", "ix_client_accounts_cpf_hash"];

    private readonly AppDbContext _dbContext;
    private readonly CpfProtector _cpf;
    private readonly IBrazilDate _date;

    public ClientRegistrationService(AppDbContext dbContext, CpfProtector cpf, IBrazilDate date)
    {
        _dbContext = dbContext;
        _cpf = cpf;
        _date = date;
    }

    /// <summary>Checks the display name and the data of <paramref name="type"/>; the problems are pt-BR messages naming the field.</summary>
    public (PreparedRegistration? Prepared, List<RegistrationProblem> Problems) Validate(AccountType type, string? displayName, RegistrationInput? input, bool existingCpf)
    {
        var problems = new List<RegistrationProblem>();
        var (profile, _) = ClientProfileRules.Check(displayName);
        if (profile is null)
        {
            problems.Add(new RegistrationProblem("companyName", type == AccountType.Personal
                ? "Nome completo obrigatório (até 200 caracteres, sem quebras de linha nem caracteres invisíveis)."
                : "Nome da empresa obrigatório (até 200 caracteres, sem quebras de linha nem caracteres invisíveis)."));
        }

        var (data, found) = RegistrationRules.Check(type, input, _date.Today, existingCpf);
        problems.AddRange(found);
        return problems.Count > 0 ? (null, problems) : (new PreparedRegistration(type, profile!.CompanyName, data!), problems);
    }

    /// <summary>The input that stands for "leave the registration data as stored" (the CPF is left out: it stays).</summary>
    public static RegistrationInput InputOf(ClientAccount a) => new(
        a.Phone, a.InvoiceEmail, a.Cnpj, a.LegalName, a.TradeName, a.StateRegistrationStatus, a.StateRegistration, a.MunicipalRegistration, a.MainCnae,
        a.TaxRegime, a.OpeningDate, a.ContactName, null, a.BirthDate);

    /// <summary>True when another account already uses this CNPJ or CPF; the answer to the caller is always <see cref="DuplicateMessage"/>.</summary>
    public async Task<bool> IsDuplicateAsync(Guid? ownId, RegistrationData data)
    {
        if (data.Cnpj is not null && await _dbContext.ClientAccounts.AnyAsync(c => c.Cnpj == data.Cnpj && c.Id != ownId))
        {
            return true;
        }

        if (data.Cpf is not null)
        {
            var hash = _cpf.Hash(data.Cpf);
            return await _dbContext.ClientAccounts.AnyAsync(c => c.CpfHash == hash && c.Id != ownId);
        }

        return false;
    }

    /// <summary>True when the data would change a locked field of the verified record (the type, the name, the tax identity and the birth date); with <paramref name="includeContactFields"/> also the phone, invoice e-mail and contact person (a Suspended customer edits nothing).</summary>
    public bool ChangesLockedField(ClientAccount a, PreparedRegistration p, bool includeContactFields = false)
    {
        var d = p.Data;
        return (includeContactFields && (d.Phone != a.Phone || d.InvoiceEmail != a.InvoiceEmail || d.ContactName != a.ContactName))
            || p.Type != a.AccountType
            || p.DisplayName != a.CompanyName
            || d.Cnpj != a.Cnpj
            || d.LegalName != a.LegalName
            || d.TradeName != a.TradeName
            || d.StateRegistrationStatus != a.StateRegistrationStatus
            || d.StateRegistration != a.StateRegistration
            || d.MunicipalRegistration != a.MunicipalRegistration
            || d.MainCnae != a.MainCnae
            || d.TaxRegime != a.TaxRegime
            || d.OpeningDate != a.OpeningDate
            || d.BirthDate != a.BirthDate
            || (d.Cpf is not null && _cpf.Hash(d.Cpf) != a.CpfHash);
    }

    /// <summary>Writes the prepared data to the account. A CPF left out stays; a business account has none, so switching to one clears it.</summary>
    public void Apply(ClientAccount a, PreparedRegistration p)
    {
        var d = p.Data;
        a.AccountType = p.Type;
        a.CompanyName = p.DisplayName;
        a.Phone = d.Phone;
        a.InvoiceEmail = d.InvoiceEmail;
        a.Cnpj = d.Cnpj;
        a.LegalName = d.LegalName;
        a.TradeName = d.TradeName;
        a.StateRegistrationStatus = d.StateRegistrationStatus;
        a.StateRegistration = d.StateRegistration;
        a.MunicipalRegistration = d.MunicipalRegistration;
        a.MainCnae = d.MainCnae;
        a.TaxRegime = d.TaxRegime;
        a.OpeningDate = d.OpeningDate;
        a.ContactName = d.ContactName;
        a.BirthDate = d.BirthDate;
        if (p.Type == AccountType.Business)
        {
            a.CpfProtected = null;
            a.CpfHash = null;
        }
        else if (d.Cpf is not null)
        {
            a.CpfProtected = _cpf.Protect(d.Cpf);
            a.CpfHash = _cpf.Hash(d.Cpf);
        }
    }

    /// <summary>What the audit trail records of a record: every field, with the CPF masked.</summary>
    public object Snapshot(ClientAccount a) => new
    {
        a.CompanyName,
        a.AccountType,
        a.Phone,
        a.InvoiceEmail,
        a.Cnpj,
        a.LegalName,
        a.TradeName,
        a.StateRegistrationStatus,
        a.StateRegistration,
        a.MunicipalRegistration,
        a.MainCnae,
        a.TaxRegime,
        a.OpeningDate,
        a.ContactName,
        Cpf = _cpf.MaskedOf(a),
        // The birth date is personal data and the audit trail is read by every admin: it records only that one is set (the controller adds whether it changed).
        HasBirthDate = a.BirthDate is not null,
    };

    public RegistrationDto ToDto(ClientAccount a) => RegistrationDto.From(a, _cpf);
}
