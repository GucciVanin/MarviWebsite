using Marvi.Domain.Catalog;

namespace Marvi.Api.Features.Catalog.Contracts;

public record DealDto(Guid Id, string Name, DiscountType DiscountType, decimal DiscountValue, DateTime StartDate, DateTime EndDate);
