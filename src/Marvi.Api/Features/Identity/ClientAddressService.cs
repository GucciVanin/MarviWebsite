using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Marvi.Api.Features.Identity;

/// <summary>What an address operation answered: the address (when there is one), or the HTTP status and the reason.</summary>
public sealed record AddressResult(int Status, ClientAddressDto? Address = null, string? Message = null)
{
    public bool Succeeded => Status is >= 200 and < 300;
}

/// <summary>
/// The one place a customer's addresses are created, changed and removed (MRV-9.3), for the customer's own endpoints and the admin's fix.
/// It keeps the two invariants (exactly one billing address, exactly one default delivery address once there is a capable one), switches
/// them atomically and writes every change to the audit log together with the change itself. An address is always looked up by its key
/// AND its owner, so one customer's key never reaches another customer's address (404).
/// Every operation runs in one database transaction that first locks the owning customer's row (<c>SELECT ... FOR NO KEY UPDATE</c>) and only then
/// reads the addresses, so two parallel requests for the same customer take turns: the 20 limit and the repeated-place rule hold under
/// parallel POSTs. (The in-memory test provider has neither transactions nor locks; the runtime suite proves it on Postgres.)
/// </summary>
public class ClientAddressService
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public ClientAddressService(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    private const string DuplicateMessage = "An address with the same postal code, number and complement is already saved.";

    public async Task<AddressResult> CreateAsync(Guid accountId, ClientAddressRequest request, string actor)
    {
        var (data, problem) = ClientAddressRules.Check(request.ToInput());
        if (data is null)
        {
            return new AddressResult(400, Message: problem);
        }

        if (WrongFlags(data.Kind, request) is { } wrong)
        {
            return new AddressResult(400, Message: wrong);
        }

        await using var transaction = await LockAccountAsync(accountId);
        var existing = await _dbContext.ClientAddresses.Where(a => a.ClientAccountId == accountId).ToListAsync();
        if (existing.Count >= ClientAddressRules.MaxAddresses)
        {
            return new AddressResult(409, Message: $"At most {ClientAddressRules.MaxAddresses} addresses are allowed.");
        }

        if (existing.Any(a => ClientAddressRules.IsSamePlace(data, a)))
        {
            return new AddressResult(409, Message: DuplicateMessage);
        }

        // The first address that can be one becomes the billing / default delivery address by itself.
        var makeBilling = request.IsBilling || (ClientAddressRules.CanBill(data.Kind) && !existing.Any(a => a.IsBilling));
        var makeDefault = request.IsDefaultDelivery || (ClientAddressRules.CanDeliver(data.Kind) && !existing.Any(a => a.IsDefault));

        var address = new ClientAddress { Id = Guid.NewGuid(), Key = Guid.NewGuid(), ClientAccountId = accountId, CreatedAt = DateTime.UtcNow };
        return await SaveAsync(transaction, accountId, existing, address, data, makeBilling, makeDefault, isNew: true, actor);
    }

    public async Task<AddressResult> UpdateAsync(Guid accountId, Guid key, ClientAddressRequest request, string actor)
    {
        var (data, problem) = ClientAddressRules.Check(request.ToInput());
        if (data is null)
        {
            return new AddressResult(400, Message: problem);
        }

        if (WrongFlags(data.Kind, request) is { } wrong)
        {
            return new AddressResult(400, Message: wrong);
        }

        await using var transaction = await LockAccountAsync(accountId);
        var existing = await _dbContext.ClientAddresses.Where(a => a.ClientAccountId == accountId).ToListAsync();
        var address = existing.FirstOrDefault(a => a.Key == key);
        if (address is null)
        {
            return new AddressResult(404);
        }

        if (existing.Any(a => a.Id != address.Id && ClientAddressRules.IsSamePlace(data, a)))
        {
            return new AddressResult(409, Message: DuplicateMessage);
        }

        // The billing and the default delivery address must stay able to be one: choose another first.
        if (address.IsBilling && !ClientAddressRules.CanBill(data.Kind))
        {
            return new AddressResult(409, Message: "This is the billing address. Choose another billing address before changing its type.");
        }

        if (address.IsDefault && !ClientAddressRules.CanDeliver(data.Kind))
        {
            return new AddressResult(409, Message: "This is the default delivery address. Choose another before changing its type.");
        }

        return await SaveAsync(transaction, accountId, existing, address, data, request.IsBilling && !address.IsBilling, request.IsDefaultDelivery && !address.IsDefault, isNew: false, actor);
    }

    public async Task<AddressResult> DeleteAsync(Guid accountId, Guid key, string actor)
    {
        await using var transaction = await LockAccountAsync(accountId);
        var address = await _dbContext.ClientAddresses.FirstOrDefaultAsync(a => a.Key == key && a.ClientAccountId == accountId);
        if (address is null)
        {
            return new AddressResult(404);
        }

        if (address.IsBilling)
        {
            return new AddressResult(409, Message: "This is the billing address. Choose another billing address before removing it.");
        }

        if (address.IsDefault)
        {
            return new AddressResult(409, Message: "This is the default delivery address. Choose another before removing it.");
        }

        var number = await CustomerNumberAsync(accountId);
        _dbContext.ClientAddresses.Remove(address);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Delete, nameof(ClientAddress), address.Id, new { address.Label, CustomerNumber = number, By = actor }))
        {
            return new AddressResult(409, Message: AuditLogger.ConflictMessage);
        }

        if (transaction is not null)
        {
            await transaction.CommitAsync();
        }

        return new AddressResult(204);
    }

    /// <summary>
    /// Starts the transaction of one operation and locks the customer's row until it ends, so operations on one customer's addresses run one
    /// at a time. <c>FOR NO KEY UPDATE</c>, not <c>FOR UPDATE</c>: the stronger lock would also block the foreign-key checks (a share lock on this
    /// row) of a quote or an order inserted for the same customer meanwhile, which has nothing to do with addresses; this one still excludes
    /// other writers of the row and other address operations. Null without a relational database (the in-memory provider the unit tests use).
    /// </summary>
    private async Task<IDbContextTransaction?> LockAccountAsync(Guid accountId)
    {
        if (!_dbContext.Database.IsRelational())
        {
            return null;
        }

        var transaction = await _dbContext.Database.BeginTransactionAsync();
        await _dbContext.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM client_accounts WHERE id = {accountId} FOR NO KEY UPDATE");
        return transaction;
    }

    private Task<int> CustomerNumberAsync(Guid accountId) =>
        _dbContext.ClientAccounts.Where(c => c.Id == accountId).Select(c => c.Number).FirstOrDefaultAsync();

    private static string? WrongFlags(ClientAddressKind kind, ClientAddressRequest request)
    {
        if (request.IsBilling && !ClientAddressRules.CanBill(kind))
        {
            return "Only a billing address can be made the billing address.";
        }

        return request.IsDefaultDelivery && !ClientAddressRules.CanDeliver(kind)
            ? "Only a delivery address can be made the default delivery address."
            : null;
    }

    /// <summary>
    /// Applies the checked data. Moving the billing / default flag is two saves in the operation's transaction (clear the old flag, then set the new
    /// one with the change and its audit entry), because the unique indexes would refuse two flagged rows even for an instant.
    /// </summary>
    private async Task<AddressResult> SaveAsync(IDbContextTransaction? transaction, Guid accountId, List<ClientAddress> existing, ClientAddress address, ClientAddressData data, bool makeBilling, bool makeDefault, bool isNew, string actor)
    {
        var before = isNew ? null : new { address.Label, address.Kind, address.IsBilling, IsDefaultDelivery = address.IsDefault };

        var previous = existing.Where(a => a.Id != address.Id && ((makeBilling && a.IsBilling) || (makeDefault && a.IsDefault))).ToList();
        if (previous.Count > 0)
        {
            foreach (var other in previous)
            {
                other.IsBilling &= !makeBilling;
                other.IsDefault &= !makeDefault;
            }

            if (!await TrySaveQuietlyAsync())
            {
                return new AddressResult(409, Message: AuditLogger.ConflictMessage);
            }
        }

        address.Label = data.Label;
        address.Kind = data.Kind;
        address.PostalCode = data.PostalCode;
        address.Street = data.Street;
        address.Number = data.Number;
        address.Complement = data.Complement;
        address.District = data.District;
        address.City = data.City;
        address.State = data.State;
        address.Country = ClientAddressRules.CountryBrazil;
        address.DeliveryNotes = data.DeliveryNotes;
        address.NeedsReview = false;
        address.IsBilling |= makeBilling;
        address.IsDefault |= makeDefault;
        if (isNew)
        {
            _dbContext.ClientAddresses.Add(address);
        }

        var number = await CustomerNumberAsync(accountId);
        var saved = await _auditLogger.TrySaveAsync(isNew ? AuditActions.Create : AuditActions.Update, nameof(ClientAddress), address.Id,
            new { address.Label, address.Kind, IsBilling = address.IsBilling, IsDefaultDelivery = address.IsDefault, Before = before, CustomerNumber = number, By = actor, MovedFrom = previous.Select(p => p.Label).ToList() });
        if (!saved)
        {
            return new AddressResult(409, Message: AuditLogger.ConflictMessage);
        }

        if (transaction is not null)
        {
            await transaction.CommitAsync();
        }

        return new AddressResult(isNew ? 201 : 200, ClientAddressDto.From(address));
    }

    private async Task<bool> TrySaveQuietlyAsync()
    {
        try
        {
            await _dbContext.SaveChangesAsync();
            return true;
        }
        catch (DbUpdateException exception) when (exception.IsConstraintViolation() || exception is DbUpdateConcurrencyException)
        {
            return false;
        }
    }
}
