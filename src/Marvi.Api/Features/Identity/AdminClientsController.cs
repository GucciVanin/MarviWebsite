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

        if (!await _dbContext.PricingTiers.AnyAsync(t => t.Id == request.PricingTierId))
        {
            return BadRequest("Unknown pricing tier.");
        }

        // A decision is taken once: a customer another admin has just approved is not approved a second time.
        if (!CustomerDecisions.CanApprove(clientAccount.Status))
        {
            return Conflict("This customer is already approved.");
        }

        var previousStatus = clientAccount.Status;
        clientAccount.Status = ClientAccountStatus.Approved;
        clientAccount.PricingTierId = request.PricingTierId;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Approve, nameof(ClientAccount), id, new { request.PricingTierId, PreviousStatus = previousStatus }))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return NoContent();
    }

    /// <summary>
    /// Moves a customer to another pricing tier (MRV-1.3, MRV-5.1: there is no credit). The status is left alone, so this also
    /// works for a suspended customer; the next quote is priced from the new tier.
    /// </summary>
    [HttpPut("{id:guid}/pricing-tier")]
    public async Task<IActionResult> UpdateTier(Guid id, UpdateClientTierRequest request)
    {
        var clientAccount = await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.Id == id);
        if (clientAccount is null)
        {
            return NotFound();
        }

        if (!await _dbContext.PricingTiers.AnyAsync(t => t.Id == request.PricingTierId))
        {
            return BadRequest("Unknown pricing tier.");
        }

        var previousTierId = clientAccount.PricingTierId;
        clientAccount.PricingTierId = request.PricingTierId;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(ClientAccount), id,
                new { request.PricingTierId, PreviousPricingTierId = previousTierId }))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

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

        if (!CustomerDecisions.CanSuspend(clientAccount.Status))
        {
            return Conflict("This customer is already suspended.");
        }

        var previousStatus = clientAccount.Status;
        clientAccount.Status = ClientAccountStatus.Suspended;
        if (!await _auditLogger.TrySaveAsync(AuditActions.Suspend, nameof(ClientAccount), id, new { PreviousStatus = previousStatus }))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return NoContent();
    }
}
