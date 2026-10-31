using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Common;
using Marvi.Domain.Auditing;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Auditing;

[ApiController]
[Route("api/admin/audit-log")]
[Authorize(Roles = "Admin")]
public class AdminAuditLogController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public AdminAuditLogController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AuditLogEntryDto>>> GetAuditLog([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var problem = Paging.Validate(page, pageSize);
        if (problem is not null)
        {
            return BadRequest(problem);
        }

        // Capped so one request cannot pull the whole table.
        var (size, skip) = Paging.Resolve(page, pageSize);

        // The body stays a plain list (callers rely on it); the size of the whole log is in a header so a screen can page.
        Response.Headers["X-Total-Count"] = (await _dbContext.AuditLogEntries.CountAsync()).ToString(System.Globalization.CultureInfo.InvariantCulture);

        var entries = await _dbContext.AuditLogEntries
            .OrderByDescending(e => e.Timestamp)
            .Skip(skip)
            .Take(size)
            .ToListAsync();

        var numbers = await NumbersAsync(entries);
        return Ok(entries.Select(e => new AuditLogEntryDto(
            e.Id, e.ActorUserId, e.Action, e.EntityName, e.EntityId, numbers.TryGetValue((e.EntityName, e.EntityId), out var number) ? number : (int?)null, e.Timestamp, e.Details)));
    }

    /// <summary>The customer (or, for an address, its owner's customer), quote or order number of each entity these entries are about (one query per kind), keyed by name and id.</summary>
    private async Task<Dictionary<(string Name, Guid Id), int>> NumbersAsync(List<AuditLogEntry> entries)
    {
        var numbers = new Dictionary<(string, Guid), int>();
        var customerIds = IdsOf(entries, nameof(ClientAccount));
        var quoteIds = IdsOf(entries, nameof(Quote));
        var orderIds = IdsOf(entries, nameof(Order));
        var addressIds = IdsOf(entries, nameof(ClientAddress));

        foreach (var c in await _dbContext.ClientAccounts.Where(c => customerIds.Contains(c.Id)).Select(c => new { c.Id, c.Number }).ToListAsync())
        {
            numbers[(nameof(ClientAccount), c.Id)] = c.Number;
        }

        // An address entry is named by its owner's customer number (MRV-9.3); the number of a removed address is not known any more.
        foreach (var a in await _dbContext.ClientAddresses.Where(a => addressIds.Contains(a.Id)).Select(a => new { a.Id, a.ClientAccount!.Number }).ToListAsync())
        {
            numbers[(nameof(ClientAddress), a.Id)] = a.Number;
        }

        // A removed address no longer has a row to join: its entry carries the owner's customer number in its details.
        foreach (var e in entries.Where(e => e.EntityName == nameof(ClientAddress) && !numbers.ContainsKey((e.EntityName, e.EntityId))))
        {
            if (!e.Details.TryGetValue("data", out var json))
            {
                continue;
            }

            try
            {
                using var document = System.Text.Json.JsonDocument.Parse(json);
                if (document.RootElement.TryGetProperty("CustomerNumber", out var number) && number.TryGetInt32(out var value) && value > 0)
                {
                    numbers[(e.EntityName, e.EntityId)] = value;
                }
            }
            catch (System.Text.Json.JsonException)
            {
                // Not the shape this code writes: the entry is shown by its name only.
            }
        }

        foreach (var q in await _dbContext.Quotes.Where(q => quoteIds.Contains(q.Id)).Select(q => new { q.Id, q.Number }).ToListAsync())
        {
            numbers[(nameof(Quote), q.Id)] = q.Number;
        }

        foreach (var o in await _dbContext.Orders.Where(o => orderIds.Contains(o.Id)).Select(o => new { o.Id, o.Number }).ToListAsync())
        {
            numbers[(nameof(Order), o.Id)] = o.Number;
        }

        return numbers;
    }

    private static List<Guid> IdsOf(List<AuditLogEntry> entries, string entityName) =>
        entries.Where(e => e.EntityName == entityName).Select(e => e.EntityId).Distinct().ToList();
}
