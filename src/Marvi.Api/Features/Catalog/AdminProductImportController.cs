using System.Text;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Inventory;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

/// <summary>
/// Imports products from a CSV file (MRV-2.1). The file is checked as a whole by <see cref="ProductImportPlanner"/>: with any
/// error nothing is stored and every problem is reported. A valid file is stored in one save together with its audit entry.
/// Rows match existing products by SKU (ignoring case); a blank cell leaves an existing value as it is.
/// </summary>
[ApiController]
[Route("api/admin/products/import")]
[Authorize(Roles = "Admin")]
public class AdminProductImportController : ControllerBase
{
    private const long MaxFileBytes = 2 * 1024 * 1024;

    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminProductImportController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    private static (Dictionary<string, Guid> Unique, HashSet<string> Ambiguous) NamesToIds(IEnumerable<(string Name, Guid Id)> rows)
    {
        var groups = rows.GroupBy(r => r.Name, StringComparer.OrdinalIgnoreCase).ToList();
        return (
            groups.Where(g => g.Count() == 1).ToDictionary(g => g.Key, g => g.Single().Id, StringComparer.OrdinalIgnoreCase),
            groups.Where(g => g.Count() > 1).Select(g => g.Key).ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    /// <param name="file">The CSV (UTF-8, comma or semicolon separated).</param>
    /// <param name="dryRun">Check the file and report what would happen, changing nothing.</param>
    /// <param name="warehouseId">The warehouse the `stock` column is for. Optional when there is exactly one warehouse.</param>
    [HttpPost]
    [RequestSizeLimit(MaxFileBytes + 64 * 1024)]
    public async Task<ActionResult<ProductImportReportDto>> Import(IFormFile? file, [FromQuery] bool dryRun = false, [FromQuery] Guid? warehouseId = null)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest("Send the CSV as a multipart file named 'file'.");
        }

        if (file.Length > MaxFileBytes)
        {
            return BadRequest($"The file is larger than {MaxFileBytes / (1024 * 1024)} MB.");
        }

        var warehouses = await _dbContext.Warehouses.Select(w => w.Id).ToListAsync();
        if (warehouseId.HasValue && !warehouses.Contains(warehouseId.Value))
        {
            return BadRequest("Warehouse not found.");
        }

        Guid? stockWarehouse = warehouseId ?? (warehouses.Count == 1 ? warehouses[0] : null);

        string text;
        using (var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true))
        {
            text = await reader.ReadToEndAsync();
        }

        // Without any tier yet the plain `price` column still needs a target: Guid.Empty stands in for the default tier
        // until an actual import creates it (a dry run must not create anything).
        var defaultTier = await DefaultPricingTier.FindAsync(_dbContext);
        // Category names are unique ignoring case, tier names are not: a name that more than one tier has is refused
        // by the planner instead of being matched to an arbitrary one.
        var categories = await _dbContext.Categories.Select(c => new { c.Name, c.Id }).ToListAsync();
        var tiers = await _dbContext.PricingTiers.Select(t => new { t.Name, t.Id }).ToListAsync();
        var (categoryIds, ambiguousCategories) = NamesToIds(categories.Select(c => (c.Name, c.Id)));
        var (tierIds, ambiguousTiers) = NamesToIds(tiers.Select(t => (t.Name, t.Id)));
        var catalog = new ImportCatalog(categoryIds, tierIds, defaultTier?.Id ?? Guid.Empty, CanImportStock: stockWarehouse.HasValue, ambiguousCategories, ambiguousTiers);

        var plan = ProductImportPlanner.Plan(text, catalog);
        if (!plan.IsValid)
        {
            return BadRequest(new ProductImportReportDto(dryRun, Applied: false, Rows: 0, Created: 0, Updated: 0,
                plan.Errors.Select(e => new ProductImportErrorDto(e.Line, e.Message)).ToList()));
        }

        var skus = plan.Products.Select(p => p.Sku.ToLowerInvariant()).ToList();
        var existing = await _dbContext.Products.Where(p => skus.Contains(p.Sku.ToLower())).ToListAsync();
        var bySku = existing.ToDictionary(p => p.Sku, StringComparer.OrdinalIgnoreCase);
        var created = plan.Products.Count(p => !bySku.ContainsKey(p.Sku));
        var updated = plan.Products.Count - created;

        if (dryRun)
        {
            return Ok(new ProductImportReportDto(DryRun: true, Applied: false, plan.Products.Count, created, updated, []));
        }

        // No default tier yet (a database nobody has registered a customer in): add it to this same save, so a failed import
        // leaves nothing behind.
        var tierForPlainPrice = defaultTier;
        if (tierForPlainPrice is null && plan.Products.Any(p => p.Prices.ContainsKey(Guid.Empty)))
        {
            tierForPlainPrice = new PricingTier { Id = Guid.NewGuid(), Name = DefaultPricingTier.DefaultName, IsDefault = true };
            _dbContext.PricingTiers.Add(tierForPlainPrice);
        }

        var existingIds = existing.Select(p => p.Id).ToList();
        var pricing = await _dbContext.ProductPricings.Where(pp => existingIds.Contains(pp.ProductId) && pp.MinQty == 1).ToListAsync();
        var inventory = stockWarehouse.HasValue
            ? await _dbContext.InventoryRecords.Where(i => existingIds.Contains(i.ProductId) && i.WarehouseId == stockWarehouse.Value).ToListAsync()
            : [];

        foreach (var row in plan.Products)
        {
            if (!bySku.TryGetValue(row.Sku, out var product))
            {
                product = new Product { Id = Guid.NewGuid(), Sku = row.Sku, IsActive = true };
                _dbContext.Products.Add(product);
            }

            product.Name = row.Name;
            if (row.Description is not null)
            {
                product.Description = row.Description;
            }

            if (row.CategoryId.HasValue)
            {
                product.CategoryId = row.CategoryId;
            }

            if (row.Attributes.Count > 0)
            {
                // A new dictionary, so the change to the jsonb column is noticed.
                var merged = new Dictionary<string, string>(product.Attributes);
                foreach (var (name, value) in row.Attributes)
                {
                    merged[name] = value;
                }

                product.Attributes = merged;
            }

            foreach (var (tierId, price) in row.Prices)
            {
                var realTierId = tierId == Guid.Empty ? tierForPlainPrice!.Id : tierId;
                var priceRow = pricing.FirstOrDefault(pp => pp.ProductId == product.Id && pp.PricingTierId == realTierId);
                if (priceRow is null)
                {
                    priceRow = new ProductPricing { Id = Guid.NewGuid(), ProductId = product.Id, PricingTierId = realTierId, MinQty = 1 };
                    pricing.Add(priceRow);
                    _dbContext.ProductPricings.Add(priceRow);
                }

                priceRow.UnitPrice = price;
            }

            if (row.Stock.HasValue)
            {
                var record = inventory.FirstOrDefault(i => i.ProductId == product.Id);
                if (record is null)
                {
                    record = new InventoryRecord { Id = Guid.NewGuid(), ProductId = product.Id, WarehouseId = stockWarehouse!.Value };
                    inventory.Add(record);
                    _dbContext.InventoryRecords.Add(record);
                }

                record.QtyOnHand = row.Stock.Value;
            }
        }

        if (!await _auditLogger.TrySaveAsync(AuditActions.Import, nameof(Product), Guid.NewGuid(),
                new { FileName = file.FileName, Rows = plan.Products.Count, Created = created, Updated = updated, WarehouseId = stockWarehouse, Skus = plan.Products.Select(p => p.Sku).ToList() }))
        {
            return Conflict("The import conflicts with changes made at the same time (for example a duplicate SKU). Nothing was imported; try again.");
        }

        return Ok(new ProductImportReportDto(DryRun: false, Applied: true, plan.Products.Count, created, updated, []));
    }
}
