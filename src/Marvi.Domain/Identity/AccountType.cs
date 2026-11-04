using System.Text.Json.Serialization;

namespace Marvi.Domain.Identity;

/// <summary>Whether the customer buys as a company or as a person (MRV-9.4). Chosen at registration; after approval only an admin can change it.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AccountType
{
    Business,
    Personal
}

/// <summary>A company's ICMS registration status (MRV-9.4): a contributor has an inscrição estadual; exempt and non-contributor companies have none.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum StateRegistrationStatus
{
    Contributor,
    Exempt,
    NonContributor
}

/// <summary>A company's tax regime (MRV-9.4).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TaxRegime
{
    Mei,
    SimplesNacional,
    LucroPresumido,
    LucroReal
}
