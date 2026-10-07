using Marvi.Api.Features.Auditing.Contracts;
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
    private const int MaxPageSize = 200;

    private readonly AppDbContext _dbContext;

    public AdminAuditLogController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AuditLogEntryDto>>> GetAuditLog([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        if (page < 1 || pageSize < 1)
        {
            return BadRequest("page and pageSize must be at least 1.");
        }

        // Capped so one request cannot pull the whole table; long math so a huge page cannot overflow the offset.
        pageSize = Math.Min(pageSize, MaxPageSize);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var entries = await _dbContext.AuditLogEntries
            .OrderByDescending(e => e.Timestamp)
            .Skip(skip)
            .Take(pageSize)
            .Select(e => new AuditLogEntryDto(e.Id, e.ActorUserId, e.Action, e.EntityName, e.EntityId, e.Timestamp, e.Details))
            .ToListAsync();

        return Ok(entries);
    }
}
