using Marvi.Api.Configuration;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

[ApiController]
[Route("api/admin/clients")]
[Authorize(Roles = "Admin")]
public class AdminClientsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;
    private readonly ClientAddressService _addresses;
    private readonly ClientRegistrationService _registration;
    private readonly CpfProtector _cpf;

    public AdminClientsController(AppDbContext dbContext, AuditLogger auditLogger, ClientAddressService addresses, ClientRegistrationService registration, CpfProtector cpf)
    {
        _dbContext = dbContext;
        _auditLogger = auditLogger;
        _addresses = addresses;
        _registration = registration;
        _cpf = cpf;
    }

    /// <summary>
    /// An admin edits a customer's whole registration record (MRV-9.4), whatever its status: the customer cannot change it after approval, the admin has
    /// full control. Changing the account type clears the other type's fields and needs <c>ConfirmTypeChange</c> (409 otherwise). Audited with the record
    /// before and after (the CPF masked, the birth date only as set/changed). A CPF left out stays as stored.
    /// </summary>
    [HttpPut("{id:guid}/registration")]
    public async Task<ActionResult<RegistrationDto>> UpdateRegistration(Guid id, AdminRegistrationRequest request)
    {
        var account = await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.Id == id);
        if (account is null)
        {
            return NotFound();
        }

        var changesType = request.AccountType != account.AccountType;
        var input = request.Registration?.ToInput() ?? (changesType ? null : ClientRegistrationService.InputOf(account));
        var (prepared, problems) = _registration.Validate(request.AccountType, request.CompanyName, input, existingCpf: account.CpfProtected is not null && !changesType);
        if (prepared is null)
        {
            return BadRequest(problems);
        }

        if (changesType && !request.ConfirmTypeChange)
        {
            return Conflict("Changing the account type clears the fields of the other type. Send ConfirmTypeChange to confirm.");
        }

        if (await _registration.IsDuplicateAsync(account.Id, prepared.Data))
        {
            return Conflict(ClientRegistrationService.DuplicateMessage);
        }

        var before = _registration.Snapshot(account);
        var birthDateBefore = account.BirthDate;
        _registration.Apply(account, prepared);
        var details = new { account.Number, Registration = true, Before = before, After = _registration.Snapshot(account), BirthDateChanged = birthDateBefore != account.BirthDate };
        if (!await _auditLogger.TrySaveAsync(AuditActions.Update, nameof(ClientAccount), id, details))
        {
            // Nothing was saved. Say what really happened: another request took the CNPJ or CPF in the meantime, or the customer changed at the same moment
            // (for example approved by another admin). The tracked, unsaved edits are dropped before asking again.
            _dbContext.ChangeTracker.Clear();
            return await _registration.IsDuplicateAsync(id, prepared.Data)
                ? Conflict(ClientRegistrationService.DuplicateMessage)
                : Conflict("The customer was changed at the same moment. Reload and try again.");
        }

        Response.Headers.CacheControl = "no-store";
        return Ok(_registration.ToDto(account));
    }

    /// <summary>
    /// Shows an admin the full CPF of a customer. The admin must say why (3 to 200 characters); the reveal is audited first, in its own entry with the reason and the masked CPF only, and only then answered (with no-store): if the audit entry
    /// cannot be written, nothing is revealed. Rate limited.
    /// </summary>
    [HttpPost("{id:guid}/cpf/reveal")]
    [EnableRateLimiting(RateLimiting.RevealPolicy)]
    public async Task<ActionResult<CpfRevealDto>> RevealCpf(Guid id, RevealCpfRequest request)
    {
        // Why the admin needs it: 3 to 200 visible characters, stored in the audit entry next to the mask.
        var reason = request.Reason?.Trim();
        if (string.IsNullOrEmpty(reason) || reason.Length is < 3 or > 200 || RegistrationRules.ContainsInvisible(reason))
        {
            return BadRequest(new[] { new RegistrationProblem("reason", "Informe o motivo da consulta (de 3 a 200 caracteres).") });
        }

        // The audit trail must never hold a CPF: a reason that looks like one (11 or more digits, punctuation aside) is refused.
        if (System.Text.RegularExpressions.Regex.IsMatch(reason.Replace(".", "").Replace("-", "").Replace(" ", ""), @"\d{11}"))
        {
            return BadRequest(new[] { new RegistrationProblem("reason", "O motivo não pode conter um número de CPF.") });
        }

        var account = await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.Id == id);
        if (account is null || _cpf.Reveal(account) is not { } cpf)
        {
            return NotFound();
        }

        if (!await _auditLogger.TrySaveAsync(AuditActions.Reveal, nameof(ClientAccount), id, new { account.Number, Cpf = CpfRules.Mask(cpf), Reason = reason }))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        Response.Headers.CacheControl = "no-store";
        return Ok(new CpfRevealDto(CpfRules.Format(cpf)));
    }

    /// <summary>
    /// An admin fixes one of a customer's addresses (MRV-9.3), with the same rules as the customer's own edit. Audited as a <c>ClientAddress</c>
    /// change by an admin. The address is found by its key AND this customer, so a key of another customer answers 404.
    /// </summary>
    [HttpPut("{id:guid}/addresses/{key:guid}")]
    [EnableRateLimiting(RateLimiting.AddressesPolicy)]
    public async Task<ActionResult<ClientAddressDto>> UpdateAddress(Guid id, Guid key, ClientAddressRequest request)
    {
        if (!await _dbContext.ClientAccounts.AnyAsync(c => c.Id == id))
        {
            return NotFound();
        }

        return (await _addresses.UpdateAsync(id, key, request, "Admin")).ToActionResult(this);
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
