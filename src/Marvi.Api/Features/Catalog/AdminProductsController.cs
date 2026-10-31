using Marvi.Api.Features.Admin;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Configuration;
using Marvi.Domain.Catalog;
using Marvi.Domain.Inventory;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/admin/products")]
[Authorize(Roles = "Admin")]
public class AdminProductsController : ControllerBase
{
    private const string InUseMessage = "The product appears on quotes or orders and cannot be deleted. Deactivate it instead.";

    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminProductsController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductAdminDto>>> GetProducts()
    {
        var products = await _dbContext.Products.ToListAsync();
        return Ok(products.Select(ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductAdminDto>> GetProduct(Guid id)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        return Ok(ToDto(product));
    }

    [HttpPost]
    public async Task<ActionResult<ProductAdminDto>> CreateProduct(UpsertProductRequest request)
    {
        var invalid = await ValidateAsync(request, existingId: null);
        if (invalid is not null)
        {
            return invalid.ToResult(this);
        }

        if (!await CategoryExistsAsync(request.CategoryId))
        {
            return BadRequest("Unknown category.");
        }

        var contentProblems = new List<ProductSetupProblem>();
        var description = ProductSetupRules.CheckDescription(request.Description, contentProblems);
        var imageUrl = ProductSetupRules.CheckImageUrl(request.ImageUrl, contentProblems);
        var attributes = ProductSetupRules.CheckAttributes(request.Attributes, contentProblems);
        if (contentProblems.Count > 0)
        {
            return BadRequest(contentProblems);
        }

        var product = new Product
        {
            Id = Guid.NewGuid(),
            Sku = AdminInput.Clean(request.Sku),
            Name = AdminInput.Clean(request.Name),
            Description = description,
            CategoryId = request.CategoryId,
            ImageUrl = imageUrl,
            IsActive = request.IsActive,
            Attributes = attributes
        };

        _dbContext.Products.Add(product);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Create, nameof(Product), product.Id, AuditedProduct(product)))
        {
            return Conflict("The product conflicts with existing data (duplicate SKU, or its category was just removed).");
        }

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, ToDto(product));
    }

    /// <summary>
    /// The guided "Novo produto" (MRV-9.5): the product, a price per tier (the rows that have one) and an opening quantity per warehouse, in ONE
    /// save with one audit entry per row, so a half-created product never exists. Everything is checked before anything is staged; problems come
    /// back by field (<c>[{ field, message }]</c>) without repeating what was typed.
    /// </summary>
    [HttpPost("with-setup")]
    [EnableRateLimiting(RateLimiting.ProductSetupPolicy)]
    public async Task<IActionResult> CreateProductWithSetup(CreateProductWithSetupRequest request)
    {
        var problems = new List<ProductSetupProblem>();
        for (var i = 0; i < (request.Prices?.Count ?? 0); i++)
        {
            if (request.Prices![i] is null)
            {
                problems.Add(new($"prices[{i}]", "Linha de preço inválida."));
            }
        }

        for (var i = 0; i < (request.Stock?.Count ?? 0); i++)
        {
            if (request.Stock![i] is null)
            {
                problems.Add(new($"stock[{i}]", "Linha de estoque inválida."));
            }
        }

        if (problems.Count > 0)
        {
            return BadRequest(problems);
        }

        var plan = ProductSetupRules.Check(
            new ProductSetupInput(
                request.Sku, request.Name, request.Description, request.ImageUrl, request.Attributes,
                request.Prices?.Select(p => new ProductSetupPrice(p.PricingTierId, p.UnitPrice)).ToList(),
                request.Stock?.Select(s => new ProductSetupStock(s.WarehouseId, s.QtyOnHand)).ToList()),
            problems);
        if (request.CategoryId is null)
        {
            problems.Add(new("categoryId", "Escolha a categoria do produto."));
        }

        if (plan is null || problems.Count > 0)
        {
            return BadRequest(problems);
        }

        problems.AddRange(await UnknownReferencesAsync(request, plan));
        if (problems.Count > 0)
        {
            return BadRequest(problems);
        }

        if (await _dbContext.Products.AnyAsync(AdminInput.EqualsIgnoreCase<Product>(p => p.Sku, plan.Sku)))
        {
            return Conflict(new[] { SkuTaken });
        }

        var product = new Product
        {
            Id = Guid.NewGuid(),
            Sku = plan.Sku,
            Name = plan.Name,
            Description = plan.Description,
            CategoryId = request.CategoryId,
            ImageUrl = plan.ImageUrl,
            IsActive = request.IsActive,
            Attributes = plan.Attributes
        };
        _dbContext.Products.Add(product);
        var audited = new List<AuditedRow>
        {
            new(AuditActions.Create, nameof(Product), product.Id, new { plan.Sku, plan.Name, plan.Description, product.CategoryId, plan.ImageUrl, product.IsActive, plan.Attributes })
        };
        foreach (var price in plan.Prices)
        {
            var row = new ProductPricing { Id = Guid.NewGuid(), ProductId = product.Id, PricingTierId = price.PricingTierId, UnitPrice = price.UnitPrice!.Value, MinQty = 1 };
            _dbContext.ProductPricings.Add(row);
            audited.Add(new(AuditActions.Create, nameof(ProductPricing), row.Id, new { productId = product.Id, row.PricingTierId, row.UnitPrice, row.MinQty }));
        }

        foreach (var stock in plan.Stock)
        {
            var row = new InventoryRecord { Id = Guid.NewGuid(), ProductId = product.Id, WarehouseId = stock.WarehouseId, QtyOnHand = stock.QtyOnHand!.Value };
            _dbContext.InventoryRecords.Add(row);
            audited.Add(new(AuditActions.Create, nameof(InventoryRecord), row.Id, new { productId = product.Id, row.WarehouseId, row.QtyOnHand }));
        }

        if (!await _auditLogger.TrySaveAsync(audited))
        {
            // A race the checks above could not see: the same SKU saved a moment ago (a double click, a retry), or something chosen was just removed.
            var taken = await _dbContext.Products.AsNoTracking().AnyAsync(AdminInput.EqualsIgnoreCase<Product>(p => p.Sku, plan.Sku));
            return Conflict(new[] { taken ? SkuTaken : new ProductSetupProblem("form", "Algo escolhido foi removido enquanto você preenchia. Recarregue a página e tente de novo.") });
        }

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, ToDto(product));
    }

    private static readonly ProductSetupProblem SkuTaken = new("sku", "SKU já existe.");

    // The category, every priced tier and every stocked warehouse must exist; a problem names the row of the form.
    private async Task<List<ProductSetupProblem>> UnknownReferencesAsync(CreateProductWithSetupRequest request, ProductSetupPlan plan)
    {
        var problems = new List<ProductSetupProblem>();
        if (!await _dbContext.Categories.AnyAsync(c => c.Id == request.CategoryId))
        {
            problems.Add(new("categoryId", "A categoria escolhida não existe."));
        }

        var tierIds = plan.Prices.Select(p => p.PricingTierId).ToList();
        var knownTiers = (await _dbContext.PricingTiers.Where(t => tierIds.Contains(t.Id)).Select(t => t.Id).ToListAsync()).ToHashSet();
        foreach (var price in plan.Prices.Where(p => !knownTiers.Contains(p.PricingTierId)))
        {
            problems.Add(new($"prices[{request.Prices!.FindIndex(r => r.PricingTierId == price.PricingTierId)}]", "A faixa de preço não existe."));
        }

        var warehouseIds = plan.Stock.Select(s => s.WarehouseId).ToList();
        var knownWarehouses = (await _dbContext.Warehouses.Where(w => warehouseIds.Contains(w.Id)).Select(w => w.Id).ToListAsync()).ToHashSet();
        foreach (var stock in plan.Stock.Where(s => !knownWarehouses.Contains(s.WarehouseId)))
        {
            problems.Add(new($"stock[{request.Stock!.FindIndex(r => r.WarehouseId == stock.WarehouseId)}]", "O armazém não existe."));
        }

        return problems;
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateProduct(Guid id, UpsertProductRequest request)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        var invalid = await ValidateAsync(request, existingId: id);
        if (invalid is not null)
        {
            return invalid.ToResult(this);
        }

        if (!await CategoryExistsAsync(request.CategoryId))
        {
            return BadRequest("Unknown category.");
        }

        // A product made before these rules (or by the CSV import) may hold a value they refuse. Editing the name, the category or the active flag
        // must still work, so a field is checked only when its submitted value differs from the stored one; an unchanged value is kept as stored.
        var contentProblems = new List<ProductSetupProblem>();
        var description = AdminInput.Clean(request.Description) == AdminInput.Clean(product.Description)
            ? product.Description
            : ProductSetupRules.CheckDescription(request.Description, contentProblems);
        var imageUrl = AdminInput.Clean(request.ImageUrl) == AdminInput.Clean(product.ImageUrl)
            ? product.ImageUrl
            : ProductSetupRules.CheckImageUrl(request.ImageUrl, contentProblems);
        var attributes = SameAttributes(request.Attributes, product.Attributes)
            ? product.Attributes
            : ProductSetupRules.CheckAttributes(request.Attributes, contentProblems);
        if (contentProblems.Count > 0)
        {
            return BadRequest(contentProblems);
        }

        product.Sku = AdminInput.Clean(request.Sku);
        product.Name = AdminInput.Clean(request.Name);
        product.Description = description;
        product.CategoryId = request.CategoryId;
        product.ImageUrl = imageUrl;
        product.IsActive = request.IsActive;
        product.Attributes = attributes;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(Product), id, AuditedProduct(product)))
        {
            return Conflict("The product conflicts with existing data (duplicate SKU, or its category was just removed).");
        }

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteProduct(Guid id)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        // Quote and order lines keep a product's name, price and quantity as history. Deleting the product would
        // delete those lines and corrupt the totals, so a product with history can only be deactivated.
        var blocked = await DeleteGuards.BlockingMessageAsync(new DeleteGuard(
            async () => await _dbContext.OrderLineItems.AnyAsync(l => l.ProductId == id) || await _dbContext.QuoteLineItems.AnyAsync(l => l.ProductId == id),
            InUseMessage));
        if (blocked is not null)
        {
            return Conflict(blocked);
        }

        _dbContext.Products.Remove(product);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Delete, nameof(Product), id))
        {
            return Conflict(InUseMessage);
        }

        return NoContent();
    }


    // SKU and name are required and bounded; the SKU is unique ignoring case (also enforced by an index, which turns a
    // race into a conflict through TrySaveAsync).
    private async Task<InputProblem?> ValidateAsync(UpsertProductRequest request, Guid? existingId)
    {
        var sku = AdminInput.Clean(request.Sku);
        var name = AdminInput.Clean(request.Name);
        if (AdminInput.IsBlank(sku) || AdminInput.IsBlank(name))
        {
            return InputProblem.BadRequest("SKU and name are required.");
        }

        if (AdminInput.ExceedsLength(sku, ProductRules.MaxSkuLength) || AdminInput.ExceedsLength(name, ProductRules.MaxNameLength))
        {
            return InputProblem.BadRequest($"SKU is limited to {ProductRules.MaxSkuLength} characters and name to {ProductRules.MaxNameLength}.");
        }

        if (await _dbContext.Products.Where(p => p.Id != existingId).AnyAsync(AdminInput.EqualsIgnoreCase<Product>(p => p.Sku, sku)))
        {
            return InputProblem.Conflict("A product with this SKU already exists.");
        }

        return null;
    }

    // A product may have no category; when it has one, it must be a real category.
    private async Task<bool> CategoryExistsAsync(Guid? categoryId) =>
        categoryId is null || await _dbContext.Categories.AnyAsync(c => c.Id == categoryId);

    // Same attributes once cleaned (names and values trimmed, blank rows dropped): what the SPA sends back for an unchanged product.
    private static bool SameAttributes(Dictionary<string, string>? submitted, Dictionary<string, string>? stored)
    {
        static Dictionary<string, string> Cleaned(Dictionary<string, string>? d) =>
            (d ?? new()).Select(kv => (Key: AdminInput.Clean(kv.Key), Value: AdminInput.Clean(kv.Value)))
                .Where(kv => kv.Key.Length > 0 || kv.Value.Length > 0)
                .GroupBy(kv => kv.Key).ToDictionary(g => g.Key, g => g.Last().Value);
        var a = Cleaned(submitted);
        var b = Cleaned(stored);
        return a.Count == b.Count && a.All(kv => b.TryGetValue(kv.Key, out var value) && value == kv.Value);
    }

    // The audit entry records what the row stores (cleaned), not the raw request.
    private static object AuditedProduct(Product product) =>
        new { product.Sku, product.Name, product.Description, product.CategoryId, product.ImageUrl, product.IsActive, product.Attributes };

    private static ProductAdminDto ToDto(Product product) =>
        new(product.Id, product.Sku, product.Name, product.Description, product.CategoryId, product.ImageUrl, product.IsActive, product.Attributes);
}
