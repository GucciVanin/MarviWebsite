using Marvi.Domain.Catalog;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;

namespace Marvi.Domain.Identity;

public class ClientAccount
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    /// <summary>
    /// The customer number (MRV-9.1): a short business reference staff read out, unlike the id, which no screen shows. Assigned once
    /// by the database when the customer registers (a sequence, so it is unique and never reused) and never changed.
    /// </summary>
    public int Number { get; set; }
    /// <summary>When the customer registered (UTC).</summary>
    public DateTime CreatedAt { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    /// <summary>The customer's named addresses (MRV-9.3): one is the billing address, one the default delivery address.</summary>
    public List<ClientAddress> Addresses { get; set; } = new();
    public Guid? PricingTierId { get; set; }
    public PricingTier? PricingTier { get; set; }
    public ClientAccountStatus Status { get; set; }

    // Registration data (MRV-9.4). Business accounts use the company fields, personal accounts the CPF and birth date; the other type's stay empty.
    // CompanyName above holds the display name of either type (company name or full name).
    public AccountType AccountType { get; set; } = AccountType.Business;
    /// <summary>Digits only (10 or 11).</summary>
    public string? Phone { get; set; }
    public string? InvoiceEmail { get; set; }
    /// <summary>14 characters, normalised (digits, or A-Z in the first 12); unique when present.</summary>
    public string? Cnpj { get; set; }
    public string? LegalName { get; set; }
    public string? TradeName { get; set; }
    public StateRegistrationStatus? StateRegistrationStatus { get; set; }
    public string? StateRegistration { get; set; }
    public string? MunicipalRegistration { get; set; }
    /// <summary>7 digits.</summary>
    public string? MainCnae { get; set; }
    public TaxRegime? TaxRegime { get; set; }
    public DateOnly? OpeningDate { get; set; }
    public string? ContactName { get; set; }
    /// <summary>The CPF encrypted with ASP.NET Data Protection: the stored column is never the plain number.</summary>
    public string? CpfProtected { get; set; }
    /// <summary>A keyed hash (HMAC-SHA256) of the CPF, only to make it unique across accounts without storing it in the clear.</summary>
    public string? CpfHash { get; set; }
    public DateOnly? BirthDate { get; set; }
    public List<Quote> Quotes { get; set; } = new();
    public List<Order> Orders { get; set; } = new();
}
