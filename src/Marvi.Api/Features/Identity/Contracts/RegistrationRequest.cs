using Marvi.Domain.Identity;

namespace Marvi.Api.Features.Identity.Contracts;

/// <summary>
/// The registration data a customer or an admin sends (MRV-9.4). Every field is optional here; <see cref="RegistrationRules"/> says which the account
/// type may and must have. A <c>Cpf</c> left out keeps the stored one (the screens never get the full number back).
/// </summary>
public record RegistrationRequest(
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
    DateOnly? BirthDate = null)
{
    public RegistrationInput ToInput() => new(
        Phone, InvoiceEmail, Cnpj, LegalName, TradeName, StateRegistrationStatus, StateRegistration, MunicipalRegistration, MainCnae, TaxRegime,
        OpeningDate, ContactName, Cpf, BirthDate);
}
