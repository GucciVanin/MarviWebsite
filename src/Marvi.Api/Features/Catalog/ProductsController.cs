using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Identity;
using Marvi.Domain.Catalog;
using Marvi.Domain.Identity;
using Marvi.Domain.Inventory;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/products")]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly BasketPricingService _basketPricing;

    public ProductsController(AppDbContext dbContext, BasketPricingService basketPricing)
    {
        _dbContext = dbContext;
        _basketPricing = basketPricing;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductListItemDto>>> GetProducts([FromQuery] Guid? category, [FromQuery] string? search)
    {
        var tier = await ResolveTierAsync();
        if (tier is null)
        {
            return Ok(Array.Empty<ProductListItemDto>());
        }

        var query = _dbContext.Products.Where(p => p.IsActive);
        if (category.HasValue)
        {
            query = query.Where(p => p.CategoryId == category.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(p => p.Name.ToLower().Contains(term) || p.Sku.ToLower().Contains(term));
        }

        var products = await query.ToListAsync();
        var pricingRows = await _dbContext.ProductPricings.Where(pp => pp.PricingTierId == tier.Id).ToListAsync();
        var now = DateTime.UtcNow;
        var activeDeals = await _dbContext.Deals.Where(Deal.ActiveAt(now)).ToListAsync();
        // Only the stock of the products being returned, not every stock record in the system.
        var productIds = products.Select(p => p.Id).ToList();
        var availableByProduct = StockAvailability.AvailableByProduct(
            await _dbContext.InventoryRecords.Where(i => productIds.Contains(i.ProductId)).ToListAsync());

        var result = products.Select(p => BuildListItem(p, tier, pricingRows, activeDeals, availableByProduct)).ToList();
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductDetailDto>> GetProduct(Guid id)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsActive);
        if (product is null)
        {
            return NotFound();
        }

        var tier = await ResolveTierAsync();
        if (tier is null)
        {
            return NotFound();
        }

        var pricingRows = await _dbContext.ProductPricings.Where(pp => pp.PricingTierId == tier.Id).ToListAsync();
        var now = DateTime.UtcNow;
        var activeDeals = await _dbContext.Deals.Where(Deal.ActiveAt(now)).ToListAsync();
        var inventory = await _dbContext.InventoryRecords.Where(i => i.ProductId == id).ToListAsync();

        var (price, dealName) = TryResolvePrice(product, tier, pricingRows, activeDeals);
        var inStock = StockAvailability.InStock(inventory);

        return Ok(new ProductDetailDto(product.Id, product.Sku, product.Name, product.Description, product.ImageUrl, product.Attributes, price, dealName, inStock));
    }

    // Only an Approved customer gets their own tier's prices (least privilege): anonymous visitors, Pending and Suspended
    // customers, and tierless callers all get the default (list-price) tier.
    private async Task<PricingTier?> ResolveTierAsync()
    {
        if (User.ClientId() is { } clientId)
        {
            var clientAccount = await _dbContext.ClientAccounts
                .Include(c => c.PricingTier)
                .FirstOrDefaultAsync(c => c.Id == clientId);

            if (clientAccount?.PricingTier is not null && CustomerEligibility.IsEligible(clientAccount.Status))
            {
                return clientAccount.PricingTier;
            }
        }

        return await DefaultPricingTier.FindAsync(_dbContext);
    }

    private ProductListItemDto BuildListItem(Product product, PricingTier tier, List<ProductPricing> pricingRows, List<Deal> activeDeals, IReadOnlyDictionary<Guid, int> availableByProduct)
    {
        var (price, dealName) = TryResolvePrice(product, tier, pricingRows, activeDeals);
        var inStock = StockAvailability.InStock(availableByProduct, product.Id);
        return new ProductListItemDto(product.Id, product.Sku, product.Name, product.ImageUrl, product.Attributes, price, dealName, inStock);
    }

    // A null price means "no price configured for this tier" (shown as "on request"); it must never read as a price of 0.
    private (decimal? Price, string? DealName) TryResolvePrice(Product product, PricingTier tier, IEnumerable<ProductPricing> pricingRows, IEnumerable<Deal> activeDeals)
    {
        var line = _basketPricing.PriceLine(product, tier, pricingRows, activeDeals, qty: 1);
        return (line.UnitPrice, line.DealName);
    }
}
