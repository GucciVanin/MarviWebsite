using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// A customer's registration data as the API shows it (MRV-9.4), to the customer themselves and to staff. The CPF is never here in full:
/// <c>CpfMasked</c> is <c>***.456.789-**</c> (null when none is stored). <c>Missing</c> lists the fields of a complete record still empty
/// (the staff completeness indicator). Nothing public returns this.
/// </summary>
public record RegistrationDto(
    AccountType AccountType,
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
    bool HasCpf,
    string? CpfMasked,
    DateOnly? BirthDate,
    List<string> Missing)
{
    public static RegistrationDto From(ClientAccount a, CpfProtector cpf)
    {
        var hasCpf = a.CpfProtected is not null;
        return new RegistrationDto(
            a.AccountType, a.Phone, a.InvoiceEmail, a.Cnpj, a.LegalName, a.TradeName, a.StateRegistrationStatus, a.StateRegistration, a.MunicipalRegistration,
            a.MainCnae, a.TaxRegime, a.OpeningDate, a.ContactName, hasCpf, cpf.MaskedOf(a), a.BirthDate, RegistrationRules.Missing(a, hasCpf).ToList());
    }
}

/// <summary>The CPF an admin asked to see in full (<c>POST /api/admin/clients/{id}/cpf/reveal</c>); the request is audited.</summary>
public record CpfRevealDto(string Cpf);

/// <summary>Why an admin asks to see a CPF in full (3 to 200 characters); it is written to the audit entry.</summary>
public record RevealCpfRequest(string? Reason);
