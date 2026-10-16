using Marvi.Api.Features.Admin.Contracts;
using Marvi.Api.Features.Catalog;
using Marvi.Domain.Identity;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Admin;

/// <summary>
/// The admin's inbox (MRV-6.2): everything that is waiting on someone, oldest first. Each group says how many there are in all and
/// lists the first <see cref="MaxItemsPerGroup"/>, so the page stays small however much has piled up. A customer stays Pending until
/// an admin approves or suspends them; the other groups are work that is not done until someone prices, restocks or fixes it.
/// </summary>
[ApiController]
[Route("api/admin/pending-actions")]
[Authorize(Roles = "Admin")]
public class AdminPendingActionsController : ControllerBase
{
    public const int MaxItemsPerGroup = 50;

    private readonly AppDbContext _dbContext;

    public AdminPendingActionsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<PendingActionsDto>> Get()
    {
        var customers = await CustomersAsync();
        var quotes = await QuotesAsync();
        var lowStock = await LowStockAsync();
        var unpriced = await UnpricedProductsAsync();

        return Ok(new PendingActionsDto(customers.Count + quotes.Count + lowStock.Count + unpriced.Count, customers, quotes, lowStock, unpriced));
    }

    private async Task<PendingGroup<PendingCustomerDto>> CustomersAsync()
    {
        var query = _dbContext.ClientAccounts.Where(c => c.Status == ClientAccountStatus.Pending);
        var items = await query
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Take(MaxItemsPerGroup)
            .Select(c => new PendingCustomerDto(c.Id, c.CompanyName, c.CreatedAt))
            .ToListAsync();
        return new PendingGroup<PendingCustomerDto>(await query.CountAsync(), items);
    }

    private async Task<PendingGroup<PendingQuoteDto>> QuotesAsync()
    {
        var query = _dbContext.Quotes.Where(q => q.Status == QuoteStatus.Submitted);
        var items = await query
            .OrderBy(q => q.CreatedAt).ThenBy(q => q.Id)
            .Take(MaxItemsPerGroup)
            .Select(q => new PendingQuoteDto(q.Id, q.ClientAccountId, q.ClientAccount!.CompanyName, q.CreatedAt, q.LineItems.Count))
            .ToListAsync();
        return new PendingGroup<PendingQuoteDto>(await query.CountAsync(), items);
    }

    private async Task<PendingGroup<LowStockDto>> LowStockAsync()
    {
        // The reorder rule is Domain's (StockAvailability.NeedsReorder); the same condition is written here so the database filters it.
        var query = _dbContext.InventoryRecords.Where(i => i.Product!.IsActive && i.QtyOnHand - i.QtyReserved <= i.ReorderPoint);
        var items = await query
            .OrderBy(i => i.QtyOnHand - i.QtyReserved - i.ReorderPoint).ThenBy(i => i.Product!.Name).ThenBy(i => i.Id)
            .Take(MaxItemsPerGroup)
            .Select(i => new LowStockDto(i.ProductId, i.Product!.Sku, i.Product.Name, i.WarehouseId, i.Warehouse!.Name, i.QtyOnHand - i.QtyReserved, i.ReorderPoint))
            .ToListAsync();
        return new PendingGroup<LowStockDto>(await query.CountAsync(), items);
    }

    private async Task<PendingGroup<UnpricedProductDto>> UnpricedProductsAsync()
    {
        // No default tier yet means nothing can be priced for anyone, so every active product is waiting for a price.
        var defaultTierId = (await DefaultPricingTier.FindAsync(_dbContext))?.Id ?? Guid.Empty;
        var query = _dbContext.Products.Where(p => p.IsActive && !p.ProductPricings.Any(pp => pp.PricingTierId == defaultTierId));
        var items = await query
            .OrderBy(p => p.Name).ThenBy(p => p.Id)
            .Take(MaxItemsPerGroup)
            .Select(p => new UnpricedProductDto(p.Id, p.Sku, p.Name))
            .ToListAsync();
        return new PendingGroup<UnpricedProductDto>(await query.CountAsync(), items);
    }
}
