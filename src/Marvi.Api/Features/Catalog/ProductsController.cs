using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
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
    private readonly PricingService _pricingService;

    public ProductsController(AppDbContext dbContext, PricingService pricingService)
    {
        _dbContext = dbContext;
        _pricingService = pricingService;
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
        var activeDeals = await _dbContext.Deals.Where(d => d.StartDate <= now && d.EndDate >= now).ToListAsync();
        var inventory = await _dbContext.InventoryRecords.ToListAsync();

        var result = products.Select(p => BuildListItem(p, tier, pricingRows, activeDeals, inventory)).ToList();
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
        var activeDeals = await _dbContext.Deals.Where(d => d.StartDate <= now && d.EndDate >= now).ToListAsync();
        var inventory = await _dbContext.InventoryRecords.Where(i => i.ProductId == id).ToListAsync();

        var (price, dealName) = TryResolvePrice(product, tier, pricingRows, activeDeals);
        var inStock = inventory.Sum(i => i.QtyOnHand - i.QtyReserved) > 0;

        return Ok(new ProductDetailDto(product.Id, product.Sku, product.Name, product.Description, product.ImageUrl, product.Attributes, price, dealName, inStock));
    }

    // Clients use their own tier; anonymous and tierless callers get the default (list-price) tier.
    private async Task<PricingTier?> ResolveTierAsync()
    {
        var clientIdClaim = User.FindFirst("client_id")?.Value;
        if (clientIdClaim is not null && Guid.TryParse(clientIdClaim, out var clientId))
        {
            var clientAccount = await _dbContext.ClientAccounts
                .Include(c => c.PricingTier)
                .FirstOrDefaultAsync(c => c.Id == clientId);

            if (clientAccount?.PricingTier is not null)
            {
                return clientAccount.PricingTier;
            }
        }

        return await DefaultPricingTier.FindAsync(_dbContext);
    }

    private ProductListItemDto BuildListItem(Product product, PricingTier tier, List<ProductPricing> pricingRows, List<Deal> activeDeals, List<InventoryRecord> inventory)
    {
        var (price, dealName) = TryResolvePrice(product, tier, pricingRows, activeDeals);
        var inStock = inventory.Where(i => i.ProductId == product.Id).Sum(i => i.QtyOnHand - i.QtyReserved) > 0;
        return new ProductListItemDto(product.Id, product.Sku, product.Name, product.ImageUrl, product.Attributes, price, dealName, inStock);
    }

    // A null price means "no price configured for this tier" (shown as "on request"); it must never read as a price of 0.
    private (decimal? Price, string? DealName) TryResolvePrice(Product product, PricingTier tier, IEnumerable<ProductPricing> pricingRows, IEnumerable<Deal> activeDeals)
    {
        try
        {
            var result = _pricingService.ResolvePrice(product, tier, pricingRows, activeDeals, qty: 1);
            return (result.UnitPrice, result.AppliedDeal?.Name);
        }
        catch (NoPriceException)
        {
            // No pricing row configured for this product/tier combination. Only this case: any other failure is a bug
            // and must surface, not be shown to customers as "on request".
            return (null, null);
        }
    }
}
