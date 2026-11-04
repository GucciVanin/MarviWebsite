using Marvi.Api.Features.Admin;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Catalog.Media;
using Marvi.Api.Features.Identity;
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
    private readonly ProductPhotoService _photos;

    public AdminProductsController(AppDbContext dbContext, AuditLogger auditLogger, ProductPhotoService photos)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
        _photos = photos;
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

    /// <summary>
    /// The guided "Novo produto" (MRV-9.5): the product, a price per tier (the rows that have one) and an opening quantity per warehouse, in ONE
    /// save with one audit entry per row, so a half-created product never exists. Everything is checked before anything is staged; problems come
    /// back by field (<c>[{ field, message }]</c>) without repeating what was typed.
    /// </summary>
    [HttpPost("with-setup")]
    [EnableRateLimiting(RateLimiting.ProductSetupPolicy)]
    public async Task<IActionResult> CreateProductWithSetup(CreateProductWithSetupRequest request)
    {
        var problems = new List<ProductProblem>();
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

        var plan = ProductRules.Check(
            new ProductInput(
                request.Sku, request.Name, request.Description, request.Attributes,
                request.Prices?.Select(p => new ProductPrice(p.PricingTierId, p.UnitPrice)).ToList(),
                request.Stock?.Select(s => new ProductStock(s.WarehouseId, s.QtyOnHand)).ToList(),
                request.CategoryId),
            problems);
        if (plan is null || problems.Count > 0)
        {
            return BadRequest(problems);
        }

        problems.AddRange(await UnknownReferencesAsync(request, plan));
        // The photo (MRV-9.7) is linked by the token an upload answered; it is checked here, with the other references, and linked in the one save below.
        ProductPhotoUpload? upload = null;
        if (!string.IsNullOrEmpty(request.PhotoToken))
        {
            var (found, photoProblem) = await _photos.ResolveAsync(request.PhotoToken, User.UserId() ?? Guid.Empty);
            upload = found;
            if (photoProblem is not null)
            {
                problems.Add(photoProblem);
            }
        }

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
            ImageUrl = upload is null ? null : ProductPhotoRules.PublicPathOf(upload.FileName),
            IsActive = request.IsActive,
            Attributes = plan.Attributes
        };
        _dbContext.Products.Add(product);
        if (upload is not null)
        {
            _dbContext.ProductPhotoUploads.Remove(upload); // same save: the product, its photo link and the used-up token commit together
        }

        var audited = new List<AuditedRow>
        {
            new(AuditActions.Create, nameof(Product), product.Id, new { plan.Sku, plan.Name, plan.Description, product.CategoryId, product.ImageUrl, product.IsActive, plan.Attributes })
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
            if (!taken && !string.IsNullOrEmpty(request.PhotoToken) && await _photos.IsSpentAsync(request.PhotoToken))
            {
                return BadRequest(new[] { new ProductProblem(ProductPhotoRules.Field, ProductPhotoRules.TokenMessage) }); // the same token was used by another request first
            }

            return Conflict(new[] { taken ? SkuTaken : new ProductProblem("form", "Algo escolhido foi removido enquanto você preenchia. Recarregue a página e tente de novo.") });
        }

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, ToDto(product));
    }

    private static readonly ProductProblem SkuTaken = new("sku", "SKU já existe.");

    // The category, every priced tier and every stocked warehouse must exist; a problem names the row of the form.
    private async Task<List<ProductProblem>> UnknownReferencesAsync(CreateProductWithSetupRequest request, ProductPlan plan)
    {
        var problems = new List<ProductProblem>();
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

    /// <summary>
    /// Edits a product. The WHOLE product is checked by <see cref="ProductRules"/>, the same rules as create and the import (MRV-9.8): a product
    /// that holds something the rules now refuse must be fixed to be saved. One exception keeps broken old data manageable: a request whose only
    /// difference from the stored product is <c>IsActive</c> is accepted as it is, so any product can be deactivated (or reactivated) without
    /// being corrected first. Problems come back by field (<c>[{ field, message }]</c>).
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateProduct(Guid id, UpdateProductRequest request)
    {
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        string? replacedPhoto = null;
        if (IsOnlyActivationChange(product, request))
        {
            product.IsActive = request.IsActive;
        }
        else
        {
            var problems = new List<ProductProblem>();
            var plan = ProductRules.Check(
                new ProductInput(request.Sku, request.Name, request.Description, request.Attributes, Prices: null, Stock: null, request.CategoryId),
                problems);
            if (!string.IsNullOrEmpty(request.PhotoToken) && request.RemovePhoto)
            {
                problems.Add(new(ProductPhotoRules.Field, ProductPhotoRules.BothMessage));
            }

            if (plan is null || problems.Count > 0)
            {
                return BadRequest(problems);
            }

            ProductPhotoUpload? upload = null;
            if (!string.IsNullOrEmpty(request.PhotoToken))
            {
                var (found, photoProblem) = await _photos.ResolveAsync(request.PhotoToken, User.UserId() ?? Guid.Empty);
                if (photoProblem is not null)
                {
                    return BadRequest(new[] { photoProblem });
                }

                upload = found;
            }

            if (request.CategoryId is { } categoryId && !await _dbContext.Categories.AnyAsync(c => c.Id == categoryId))
            {
                return BadRequest(new[] { new ProductProblem("categoryId", "A categoria escolhida não existe.") });
            }

            if (await _dbContext.Products.Where(p => p.Id != id).AnyAsync(AdminInput.EqualsIgnoreCase<Product>(p => p.Sku, plan.Sku)))
            {
                return Conflict(new[] { SkuTaken });
            }

            product.Sku = plan.Sku;
            product.Name = plan.Name;
            product.Description = plan.Description;
            product.CategoryId = request.CategoryId;
            if (upload is not null)
            {
                replacedPhoto = product.ImageUrl;
                product.ImageUrl = ProductPhotoRules.PublicPathOf(upload.FileName);
                _dbContext.ProductPhotoUploads.Remove(upload); // same save as the product's other fields
            }
            else if (request.RemovePhoto)
            {
                replacedPhoto = product.ImageUrl;
                product.ImageUrl = null;
            }

            product.IsActive = request.IsActive;
            product.Attributes = plan.Attributes;
        }

        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(Product), id, AuditedProduct(product)))
        {
            // A race the checks above could not see: the same SKU taken a moment ago, or the category removed.
            var taken = await _dbContext.Products.AsNoTracking().AnyAsync(p => p.Id != id && p.Sku.ToLower() == product.Sku.ToLower());
            if (!taken && !string.IsNullOrEmpty(request.PhotoToken) && await _photos.IsSpentAsync(request.PhotoToken))
            {
                return BadRequest(new[] { new ProductProblem(ProductPhotoRules.Field, ProductPhotoRules.TokenMessage) });
            }

            return Conflict(new[] { taken ? SkuTaken : new ProductProblem("form", "Algo escolhido foi removido enquanto você preenchia. Recarregue a página e tente de novo.") });
        }

        // The save succeeded: the previous photo (replaced or removed) has no product any more, so its file goes too.
        _photos.DeleteFileOf(replacedPhoto);
        return NoContent();
    }

    /// <summary>
    /// Read-only data check (MRV-9.8): every stored product run through <see cref="ProductRules"/>, listing the ones that break them (SKU, name,
    /// description, attributes) with the field messages. Nothing is changed. Run it, and fix what it lists, before the first production
    /// migration (docs/operations.md section 8).
    /// </summary>
    [HttpGet("data-check")]
    public async Task<ActionResult<ProductDataCheckDto>> DataCheck()
    {
        var products = await _dbContext.Products.AsNoTracking().OrderBy(p => p.Sku).ToListAsync();
        var broken = new List<BrokenProductDto>();
        foreach (var product in products)
        {
            var problems = new List<ProductProblem>();
            ProductRules.Check(new ProductInput(product.Sku, product.Name, product.Description, product.Attributes, Prices: null, Stock: null, product.CategoryId), problems);
            if (problems.Count > 0)
            {
                broken.Add(new BrokenProductDto(product.Id, product.Sku, product.Name, problems));
            }
        }

        return Ok(new ProductDataCheckDto(products.Count, broken.Count, broken));
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

        _photos.DeleteFileOf(product.ImageUrl);
        return NoContent();
    }


    // The request differs from the stored product in IsActive and in nothing else (the one edit that skips the rules, see UpdateProduct).
    private static bool IsOnlyActivationChange(Product product, UpdateProductRequest request) =>
        request.IsActive != product.IsActive
        && AdminInput.Clean(request.Sku) == AdminInput.Clean(product.Sku)
        && AdminInput.Clean(request.Name) == AdminInput.Clean(product.Name)
        && AdminInput.Clean(request.Description) == AdminInput.Clean(product.Description)
        && string.IsNullOrEmpty(request.PhotoToken)
        && !request.RemovePhoto
        && request.CategoryId == product.CategoryId
        && SameAttributes(request.Attributes, product.Attributes);

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
