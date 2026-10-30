using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;

namespace Marvi.Tests.Support;

/// <summary>Valid structured addresses for the tests (MRV-9.3). Fixed values: nothing random.</summary>
public static class TestAddresses
{
    /// <summary>The billing address a test customer registers with.</summary>
    public static ClientAddressRequest Main => new(null, null, "01001-000", "Praça da Sé", "10", null, "Sé", "São Paulo", "SP", null);

    /// <summary>A valid address that differs from <see cref="Main"/> and from every other <paramref name="number"/>.</summary>
    public static ClientAddressRequest Other(string number = "200", ClientAddressKind kind = ClientAddressKind.Delivery, string label = "Filial", bool billing = false, bool defaultDelivery = false) =>
        new(label, kind, "13010-000", "Rua Barão de Jaguara", number, "Sala 3", "Centro", "Campinas", "SP", "Entregar de manhã", billing, defaultDelivery);
}
