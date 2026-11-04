using Marvi.Domain.Catalog;

namespace Marvi.Api.Features.Catalog.Contracts;

/// <summary>The data check (MRV-9.8): how many products were looked at, and the ones that break the product rules with the field messages.</summary>
public record ProductDataCheckDto(int Checked, int Broken, List<BrokenProductDto> Products);

public record BrokenProductDto(Guid Id, string Sku, string Name, List<ProductProblem> Problems);
