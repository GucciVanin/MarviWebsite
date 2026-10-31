using Marvi.Api.Features.Admin.Contracts;
using Marvi.Api.Features.Catalog;
using Marvi.Domain.Identity;
using Marvi.Domain.Inventory;
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
        var unstocked = await UnstockedProductsAsync();
        var contactMessages = await ContactMessagesAsync();

        return Ok(new PendingActionsDto(customers.Count + quotes.Count + lowStock.Count + unpriced.Count + unstocked.Count + contactMessages.Count, customers, quotes, lowStock, unpriced, unstocked, contactMessages));
    }

    private async Task<PendingGroup<PendingCustomerDto>> CustomersAsync()
    {
        var query = _dbContext.ClientAccounts.Where(c => c.Status == ClientAccountStatus.Pending);
        var items = await query
            .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .Take(MaxItemsPerGroup)
            .Select(c => new PendingCustomerDto(c.Id, c.Number, c.CompanyName, c.CreatedAt))
            .ToListAsync();
        return new PendingGroup<PendingCustomerDto>(await query.CountAsync(), items);
    }

    private async Task<PendingGroup<PendingQuoteDto>> QuotesAsync()
    {
        var query = _dbContext.Quotes.Where(q => q.Status == QuoteStatus.Submitted);
        var items = await query
            .OrderBy(q => q.CreatedAt).ThenBy(q => q.Id)
            .Take(MaxItemsPerGroup)
            .Select(q => new PendingQuoteDto(q.Id, q.Number, q.ClientAccountId, q.ClientAccount!.Number, q.ClientAccount!.CompanyName, q.CreatedAt, q.LineItems.Count))
            .ToListAsync();
        return new PendingGroup<PendingQuoteDto>(await query.CountAsync(), items);
    }

    private async Task<PendingGroup<PendingContactMessageDto>> ContactMessagesAsync()
    {
        // Unlike the other groups, newest first: a visitor message is read as it arrives (MRV-2.8).
        var query = _dbContext.ContactMessages.Where(m => m.HandledAt == null);
        var items = await query
            .OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id)
            .Take(MaxItemsPerGroup)
            .Select(m => new PendingContactMessageDto(m.Id, m.Name, m.Email, m.Phone, m.Company, m.Message, m.CreatedAt))
            .ToListAsync();
        return new PendingGroup<PendingContactMessageDto>(await query.CountAsync(), items);
    }

    private async Task<PendingGroup<LowStockDto>> LowStockAsync()
    {
        // The reorder rule is Domain's, as an expression the database filters by (StockAvailability.NeedsReorderFilter).
        var query = _dbContext.InventoryRecords.Where(StockAvailability.NeedsReorderFilter).Where(i => i.Product!.IsActive);
        var items = await query
            .OrderBy(i => i.QtyOnHand - i.QtyReserved - i.ReorderPoint).ThenBy(i => i.Product!.Name).ThenBy(i => i.Id)
            .Take(MaxItemsPerGroup)
            .Select(i => new LowStockDto(i.ProductId, i.Product!.Sku, i.Product.Name, i.WarehouseId, i.Warehouse!.Name, i.QtyOnHand - i.QtyReserved, i.ReorderPoint))
            .ToListAsync();
        return new PendingGroup<LowStockDto>(await query.CountAsync(), items);
    }

    private async Task<PendingGroup<ProductRefDto>> UnpricedProductsAsync()
    {
        // A visitor is priced for one unit, so a price a visitor can see is a default-tier row that applies from quantity 1 (MinQty <= 1);
        // a product priced only for bigger quantities still shows "Sob consulta". No default tier yet means nothing can be priced for
        // anyone, so every active product is waiting for a price.
        var defaultTierId = (await DefaultPricingTier.FindAsync(_dbContext))?.Id ?? Guid.Empty;
        var query = _dbContext.Products.Where(p => p.IsActive && !p.ProductPricings.Any(pp => pp.PricingTierId == defaultTierId && pp.MinQty <= 1));
        return await GroupOfProductsAsync(query);
    }

    private async Task<PendingGroup<ProductRefDto>> UnstockedProductsAsync()
    {
        // An active product that no warehouse has ever held cannot be bought (one with a record at zero is low stock instead).
        var query = _dbContext.Products.Where(p => p.IsActive && !p.InventoryRecords.Any());
        return await GroupOfProductsAsync(query);
    }

    private async Task<PendingGroup<ProductRefDto>> GroupOfProductsAsync(IQueryable<Marvi.Domain.Catalog.Product> query)
    {
        var items = await query
            .OrderBy(p => p.Name).ThenBy(p => p.Id)
            .Take(MaxItemsPerGroup)
            .Select(p => new ProductRefDto(p.Id, p.Sku, p.Name))
            .ToListAsync();
        return new PendingGroup<ProductRefDto>(await query.CountAsync(), items);
    }
}
