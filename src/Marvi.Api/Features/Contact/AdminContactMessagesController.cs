using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Contact.Contracts;
using Marvi.Domain.Contact;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Contact;

/// <summary>The admin's view of the contact messages (MRV-2.8): list them, and mark one handled so it leaves the inbox.</summary>
[ApiController]
[Route("api/admin/contact-messages")]
[Authorize(Roles = "Admin")]
public class AdminContactMessagesController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminContactMessagesController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    /// <summary>Newest first. <c>handled</c> filters (true: handled only, false: waiting only); omitted lists all.</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<ContactMessageDto>>> List([FromQuery] bool? handled, [FromQuery] int page = 1, [FromQuery] int pageSize = Paging.DefaultPageSize)
    {
        var problem = Paging.Validate(page, pageSize);
        if (problem is not null)
        {
            return BadRequest(problem);
        }

        var (size, skip) = Paging.Resolve(page, pageSize);
        IQueryable<ContactMessage> query = _dbContext.ContactMessages;
        if (handled is not null)
        {
            query = handled.Value ? query.Where(m => m.HandledAt != null) : query.Where(m => m.HandledAt == null);
        }

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id)
            .Skip(skip).Take(size)
            .Select(m => new ContactMessageDto(m.Id, m.Name, m.Email, m.Phone, m.Company, m.Message, m.CreatedAt, m.HandledAt))
            .ToListAsync();

        return Ok(new PagedResult<ContactMessageDto>(items, page, size, total));
    }

    [HttpPost("{id:guid}/handle")]
    public async Task<IActionResult> Handle(Guid id)
    {
        var message = await _dbContext.ContactMessages.FirstOrDefaultAsync(m => m.Id == id);
        if (message is null)
        {
            return NotFound();
        }

        if (message.HandledAt is not null)
        {
            return Conflict("This message is already handled.");
        }

        // HandledAt is a concurrency token: if another admin handled it between the read and this save, the save is refused (409).
        message.HandledAt = DateTime.UtcNow;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(ContactMessage), id, new { Handled = true }))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return NoContent();
    }
}
