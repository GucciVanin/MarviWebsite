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
    private readonly AppDbContext _dbContext;

    public AdminAuditLogController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AuditLogEntryDto>>> GetAuditLog([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var entries = await _dbContext.AuditLogEntries
            .OrderByDescending(e => e.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new AuditLogEntryDto(e.Id, e.ActorUserId, e.Action, e.EntityName, e.EntityId, e.Timestamp, e.Details))
            .ToListAsync();

        return Ok(entries);
    }
}
