using System.Text.Json;
using Marvi.Domain.Auditing;
using Marvi.Domain.Catalog;
using Marvi.Domain.Coverage;
using Marvi.Domain.Identity;
using Marvi.Domain.Inventory;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Marvi.Infrastructure.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<ClientAccount> ClientAccounts => Set<ClientAccount>();
    public DbSet<EmployeeAccount> EmployeeAccounts => Set<EmployeeAccount>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<PricingTier> PricingTiers => Set<PricingTier>();
    public DbSet<ProductPricing> ProductPricings => Set<ProductPricing>();
    public DbSet<Deal> Deals => Set<Deal>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<CoverageArea> CoverageAreas => Set<CoverageArea>();
    public DbSet<Quote> Quotes => Set<Quote>();
    public DbSet<QuoteLineItem> QuoteLineItems => Set<QuoteLineItem>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLineItem> OrderLineItems => Set<OrderLineItem>();
    public DbSet<InventoryRecord> InventoryRecords => Set<InventoryRecord>();
    public DbSet<AuditLogEntry> AuditLogEntries => Set<AuditLogEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        var stringDictionaryConverter = new ValueConverter<Dictionary<string, string>, string>(
            dictionary => JsonSerializer.Serialize(dictionary, (JsonSerializerOptions?)null),
            json => JsonSerializer.Deserialize<Dictionary<string, string>>(json, (JsonSerializerOptions?)null) ?? new Dictionary<string, string>());

        var stringDictionaryComparer = new ValueComparer<Dictionary<string, string>>(
            (a, b) => (a ?? new Dictionary<string, string>()).SequenceEqual(b ?? new Dictionary<string, string>()),
            d => d.Aggregate(0, (hash, kvp) => HashCode.Combine(hash, kvp.Key, kvp.Value)),
            d => new Dictionary<string, string>(d));

        builder.Entity<Product>()
            .Property(p => p.Attributes)
            .HasConversion(stringDictionaryConverter)
            .HasColumnType("jsonb")
            .Metadata.SetValueComparer(stringDictionaryComparer);

        builder.Entity<AuditLogEntry>()
            .Property(a => a.Details)
            .HasConversion(stringDictionaryConverter)
            .HasColumnType("jsonb")
            .Metadata.SetValueComparer(stringDictionaryComparer);

        builder.Entity<CoverageArea>()
            .Property(c => c.PolygonGeoJson)
            .HasColumnType("jsonb");

        // Category names are unique ignoring case. That is an expression index on lower(name), which EF cannot model,
        // so it is created by hand in migration CaseInsensitiveCategoryNames and is deliberately absent from the model.

        // No navigation properties: products reference a category by id only. Restrict keeps a used category from being deleted.
        builder.Entity<Product>()
            .HasOne<Category>()
            .WithMany()
            .HasForeignKey(p => p.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        // History is never deleted by a cascade. Quote and order lines record what was sold; deleting a product (or the
        // client / warehouse behind an order) must not silently remove them and leave totals that no longer add up.
        // Controllers return 409 first; Restrict is the database-level backstop.
        builder.Entity<OrderLineItem>().HasOne(l => l.Product).WithMany().HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<QuoteLineItem>().HasOne(l => l.Product).WithMany().HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Order>().HasOne(o => o.ClientAccount).WithMany(c => c.Orders).HasForeignKey(o => o.ClientAccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<Quote>().HasOne(q => q.ClientAccount).WithMany(c => c.Quotes).HasForeignKey(q => q.ClientAccountId).OnDelete(DeleteBehavior.Restrict);
        // Stock records are deleted deliberately, never as a side effect of deleting the warehouse.
        builder.Entity<InventoryRecord>().HasOne(i => i.Warehouse).WithMany(w => w.InventoryRecords).HasForeignKey(i => i.WarehouseId).OnDelete(DeleteBehavior.Restrict);

        // Product SKUs are unique ignoring case. That is an expression index on lower(sku), which EF cannot model, so it
        // is created by hand in migration ProtectHistoryAndUniqueSkus and is deliberately absent from the model.

        // At most one default tier; the filter is ignored by non-relational test providers.
        builder.Entity<PricingTier>()
            .HasIndex(t => t.IsDefault)
            .IsUnique()
            .HasFilter("is_default = true");

        builder.Entity<ProductPricing>()
            .HasIndex(pp => new { pp.ProductId, pp.PricingTierId, pp.MinQty })
            .IsUnique();

        builder.Entity<InventoryRecord>()
            .HasIndex(i => new { i.ProductId, i.WarehouseId })
            .IsUnique();
    }
}
