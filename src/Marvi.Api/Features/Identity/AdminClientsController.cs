using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

[ApiController]
[Route("api/admin/clients")]
[Authorize(Roles = "Admin")]
public class AdminClientsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminClientsController(AppDbContext dbContext, AuditLogger auditLogger)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    [HttpPut("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, ApproveClientRequest request)
    {
        var clientAccount = await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.Id == id);
        if (clientAccount is null)
        {
            return NotFound();
        }

        if (request.CreditLimit < 0)
        {
            return BadRequest("Credit limit cannot be negative.");
        }

        if (!await _dbContext.PricingTiers.AnyAsync(t => t.Id == request.PricingTierId))
        {
            return BadRequest("Unknown pricing tier.");
        }

        clientAccount.Status = ClientAccountStatus.Approved;
        clientAccount.PricingTierId = request.PricingTierId;
        clientAccount.CreditLimit = request.CreditLimit;
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Approve", nameof(ClientAccount), id, new { request.PricingTierId, request.CreditLimit });

        return NoContent();
    }

    [HttpPut("{id:guid}/suspend")]
    public async Task<IActionResult> Suspend(Guid id)
    {
        var clientAccount = await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.Id == id);
        if (clientAccount is null)
        {
            return NotFound();
        }

        clientAccount.Status = ClientAccountStatus.Suspended;
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Suspend", nameof(ClientAccount), id);

        return NoContent();
    }
}
