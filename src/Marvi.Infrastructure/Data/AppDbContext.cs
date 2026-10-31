using System.Text.Json;
using Marvi.Domain.Auditing;
using Marvi.Domain.Catalog;
using Marvi.Domain.Contact;
using Marvi.Domain.Coverage;
using Marvi.Domain.Delivery;
using Marvi.Domain.Identity;
using Marvi.Domain.Inventory;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.EntityFrameworkCore.ValueGeneration;

namespace Marvi.Infrastructure.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<ClientAccount> ClientAccounts => Set<ClientAccount>();
    public DbSet<ClientAddress> ClientAddresses => Set<ClientAddress>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();
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
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();

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
        // The status is a concurrency token (MRV-6.1): a decision about a customer applies only if their status is still the one it was
        // read with, so two admins deciding at once cannot overwrite each other (the second gets a 409).
        builder.Entity<ClientAccount>().Property(c => c.Status).IsConcurrencyToken();
        // Customer, quote and order numbers (MRV-9.1): the database hands them out from a sequence on insert, so they are unique and never
        // reused (a sequence does not go back when a row is deleted or an insert rolls back). A unique index backs that up.
        ConfigureNumber<ClientAccount>(builder, "client_number_seq");
        builder.Entity<AppSetting>(e =>
        {
            e.HasKey(s => s.Key);
            e.Property(s => s.Key).HasMaxLength(100);
            e.Property(s => s.Value).HasMaxLength(200);
        });

        // Registration data (MRV-9.4). Existing rows become Business accounts (the database default); the owner categorises real customers when the production
        // database is migrated. CNPJ and the keyed CPF hash are unique when present (NULLs never collide). The CPF itself is only stored encrypted.
        builder.Entity<ClientAccount>(e =>
        {
            e.Property(c => c.AccountType).HasDefaultValue(AccountType.Business);
            e.Property(c => c.Phone).HasMaxLength(20);
            e.Property(c => c.InvoiceEmail).HasMaxLength(RegistrationRules.MaxEmailLength);
            e.Property(c => c.Cnpj).HasMaxLength(CnpjRules.Length);
            e.Property(c => c.LegalName).HasMaxLength(RegistrationRules.MaxNameLength);
            e.Property(c => c.TradeName).HasMaxLength(RegistrationRules.MaxNameLength);
            e.Property(c => c.StateRegistration).HasMaxLength(14);
            e.Property(c => c.MunicipalRegistration).HasMaxLength(RegistrationRules.MaxMunicipalRegistrationLength);
            e.Property(c => c.MainCnae).HasMaxLength(7);
            e.Property(c => c.ContactName).HasMaxLength(RegistrationRules.MaxContactNameLength);
            e.Property(c => c.CpfProtected).HasMaxLength(500);
            e.Property(c => c.CpfHash).HasMaxLength(64);
            e.HasIndex(c => c.Cnpj).IsUnique();
            e.HasIndex(c => c.CpfHash).IsUnique();
        });
        ConfigureNumber<Quote>(builder, "quote_number_seq");
        ConfigureNumber<Order>(builder, "order_number_seq");
        // A customer's addresses (MRV-9.3). The street column is wider than the 200 the rules allow because the migration copies the old
        // free-text address (up to 500) into it. The unique filtered indexes make "one billing address, one default delivery address
        // per customer" a database fact; the filter is ignored by non-relational test providers (the service enforces it there too).
        builder.Entity<ClientAddress>(e =>
        {
            e.HasOne(a => a.ClientAccount).WithMany(c => c.Addresses).HasForeignKey(a => a.ClientAccountId).OnDelete(DeleteBehavior.Cascade);
            e.Property(a => a.Label).HasMaxLength(ClientAddressRules.MaxLabelLength);
            e.Property(a => a.PostalCode).HasMaxLength(8);
            e.Property(a => a.Street).HasMaxLength(500);
            e.Property(a => a.Number).HasMaxLength(ClientAddressRules.MaxNumberLength);
            e.Property(a => a.Complement).HasMaxLength(ClientAddressRules.MaxComplementLength);
            e.Property(a => a.District).HasMaxLength(ClientAddressRules.MaxDistrictLength);
            e.Property(a => a.City).HasMaxLength(ClientAddressRules.MaxCityLength);
            e.Property(a => a.State).HasMaxLength(2);
            e.Property(a => a.Country).HasMaxLength(2);
            e.Property(a => a.DeliveryNotes).HasMaxLength(ClientAddressRules.MaxNotesLength);
            e.HasIndex(a => a.Key).IsUnique();
            e.HasIndex(a => a.ClientAccountId, "plain").HasDatabaseName("ix_client_addresses_client_account_id");
            e.HasIndex(a => a.ClientAccountId, "billing").HasDatabaseName("ix_client_addresses_one_billing").IsUnique().HasFilter("is_billing = true");
            e.HasIndex(a => a.ClientAccountId, "default").HasDatabaseName("ix_client_addresses_one_default").IsUnique().HasFilter("is_default = true");
        });

        // The delivery address snapshot of a quote and an order (MRV-9.6): the fields are copied from the customer's address when it is chosen, so
        // editing the address later changes nothing here. The link to the address row is only a convenience: the database clears it (SET NULL)
        // when the address is removed.
        ConfigureDeliveryAddress<Quote>(builder);
        // The quote's status and delivery address are concurrency tokens: accepting a quote copies its address to the order, so an accept and a change of
        // address that race cannot both succeed (the loser gets a 409 and no order is built from an address the quote no longer has).
        builder.Entity<Quote>().Property(q => q.Status).IsConcurrencyToken();
        builder.Entity<Quote>().Property(q => q.DeliveryAddressId).IsConcurrencyToken();
        ConfigureDeliveryAddress<Order>(builder);
        builder.Entity<Order>().Property(o => o.DeliveryAddress).HasMaxLength(Order.MaxDeliveryAddressLength);

        // Contact messages (MRV-2.8): length limits mirror the form rules. HandledAt is a concurrency token so two admins handling the
        // same message at once cannot both succeed (the second save is refused and answers 409).
        builder.Entity<ContactMessage>(e =>
        {
            e.Property(m => m.Name).HasMaxLength(ContactMessage.MaxNameLength);
            e.Property(m => m.Email).HasMaxLength(ContactMessage.MaxEmailLength);
            e.Property(m => m.Phone).HasMaxLength(ContactMessage.MaxPhoneLength);
            e.Property(m => m.Company).HasMaxLength(ContactMessage.MaxCompanyLength);
            e.Property(m => m.Message).HasMaxLength(ContactMessage.MaxMessageLength);
            e.Property(m => m.HandledAt).IsConcurrencyToken();
            e.HasIndex(m => m.CreatedAt);
        });

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

    private static void ConfigureDeliveryAddress<TEntity>(ModelBuilder builder)
        where TEntity : class, IHasDeliveryAddress
    {
        builder.Entity<TEntity>(e =>
        {
            e.HasOne<ClientAddress>().WithMany().HasForeignKey(d => d.DeliveryAddressId).OnDelete(DeleteBehavior.SetNull);
            e.Property(d => d.DeliveryAddressLabel).HasMaxLength(ClientAddressRules.MaxLabelLength);
            e.Property(d => d.DeliveryAddressStreet).HasMaxLength(500);
            e.Property(d => d.DeliveryAddressNumber).HasMaxLength(ClientAddressRules.MaxNumberLength);
            e.Property(d => d.DeliveryAddressComplement).HasMaxLength(ClientAddressRules.MaxComplementLength);
            e.Property(d => d.DeliveryAddressDistrict).HasMaxLength(ClientAddressRules.MaxDistrictLength);
            e.Property(d => d.DeliveryAddressCity).HasMaxLength(ClientAddressRules.MaxCityLength);
            e.Property(d => d.DeliveryAddressState).HasMaxLength(2);
            e.Property(d => d.DeliveryAddressPostalCode).HasMaxLength(8);
            e.Property(d => d.DeliveryAddressNotes).HasMaxLength(ClientAddressRules.MaxNotesLength);
        });
    }

    private void ConfigureNumber<TEntity>(ModelBuilder builder, string sequence)
        where TEntity : class
    {
        var property = builder.Entity<TEntity>().Property<int>("Number");
        builder.Entity<TEntity>().HasIndex("Number").IsUnique();
        if (Database.IsRelational())
        {
            builder.HasSequence<int>(sequence);
            property.HasDefaultValueSql($"nextval('{sequence}')").ValueGeneratedOnAdd();
        }
        else
        {
            // Non-relational test providers have no sequences: a process-wide counter keeps the numbers unique.
            property.ValueGeneratedOnAdd().HasValueGenerator<InMemoryNumberGenerator>();
        }
    }

    /// <summary>Stands in for a database sequence where there is none (the InMemory test provider).</summary>
    private sealed class InMemoryNumberGenerator : ValueGenerator<int>
    {
        private static int _last;

        public override bool GeneratesTemporaryValues => false;

        public override int Next(EntityEntry entry) => Interlocked.Increment(ref _last);
    }
}
