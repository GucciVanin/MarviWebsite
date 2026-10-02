using Marvi.Domain.Catalog;

namespace Marvi.Api.Features.Catalog.Contracts;

public record DealAdminDto(
    Guid Id,
    string Name,
    DiscountType DiscountType,
    decimal DiscountValue,
    DateTime StartDate,
    DateTime EndDate,
    List<Guid> ProductIds,
    List<Guid> CategoryIds,
    int MinQty);
