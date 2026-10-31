using Marvi.Api.Configuration;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

/// <summary>A customer reads and edits their own company details (MRV-2.2). Always their own: the account comes from the token, never from the request.</summary>
[ApiController]
[Route("api/client/profile")]
[Authorize(Roles = "Client")]
public class ClientProfileController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly ClientRegistrationService _registration;

    public ClientProfileController(AppDbContext dbContext, ClientRegistrationService registration)
    {
        _dbContext = dbContext;
        _registration = registration;
    }

    [HttpGet]
    public async Task<ActionResult<ClientOwnProfileDto>> Get()
    {
        NoStore();
        var account = await FindOwnAccountAsync();
        return account is null ? Forbid() : Ok(ToDto(account));
    }

    /// <summary>
    /// Changes the display name, the account type and the registration data (addresses have their own endpoints, MRV-9.3). The record is verified when the
    /// customer is approved, so from then on a change to a locked field (type, name, CNPJ, CPF, razão social, nome fantasia, inscrições, CNAE, regime,
    /// abertura, nascimento) answers 403 and only an admin can make it (MRV-9.4); phone, invoice e-mail and contact person stay editable for an
    /// Approved customer. A Suspended customer cannot edit any registration field (403; spec AC-4). A customer's self-edit is not an admin mutation, so it is not audited.
    /// </summary>
    [HttpPut]
    [EnableRateLimiting(RateLimiting.ProfilePolicy)]
    public async Task<ActionResult<ClientOwnProfileDto>> Update(UpdateClientProfileRequest request)
    {
        NoStore();
        var account = await FindOwnAccountAsync();
        if (account is null)
        {
            return Forbid();
        }

        // Without Registration the stored data is left as it is (only the name and a type that stays the same); a changed type starts from an empty record.
        var type = request.AccountType ?? account.AccountType;
        var input = request.Registration?.ToInput() ?? (type == account.AccountType ? ClientRegistrationService.InputOf(account) : null);
        var (prepared, problems) = _registration.Validate(type, request.CompanyName, input, existingCpf: account.CpfProtected is not null && type == AccountType.Personal);
        if (prepared is null)
        {
            return BadRequest(problems);
        }

        if (account.Status != ClientAccountStatus.Pending && _registration.ChangesLockedField(account, prepared, account.Status == ClientAccountStatus.Suspended))
        {
            return StatusCode(StatusCodes.Status403Forbidden, ClientRegistrationService.LockedMessage);
        }

        if (await _registration.IsDuplicateAsync(account.Id, prepared.Data))
        {
            return Conflict(ClientRegistrationService.DuplicateMessage);
        }

        // The customer's status is a concurrency token (MRV-6.1), so an admin deciding this customer at the same moment makes
        // this save fail once. Their decision does not touch these fields: read the row again and apply the edit on top of it.
        for (var attempt = 0; ; attempt++)
        {
            if (account.Status != ClientAccountStatus.Pending && _registration.ChangesLockedField(account, prepared, account.Status == ClientAccountStatus.Suspended))
            {
                // Approved at this very moment: the record is now verified and locked.
                return StatusCode(StatusCodes.Status403Forbidden, ClientRegistrationService.LockedMessage);
            }

            _registration.Apply(account, prepared);
            try
            {
                await _dbContext.SaveChangesAsync();
                return Ok(ToDto(account));
            }
            catch (DbUpdateConcurrencyException) when (attempt < 2)
            {
                await _dbContext.Entry(account).ReloadAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                return Conflict("Your account was changed at the same moment. Reload and try again.");
            }
            catch (DbUpdateException exception) when (exception.IsUniqueViolationOf(ClientRegistrationService.DuplicateIndexes))
            {
                return Conflict(ClientRegistrationService.DuplicateMessage);
            }
        }
    }

    /// <summary>The profile carries the birth date and the CPF mask: browsers and proxies must not keep a copy.</summary>
    private void NoStore() => Response.Headers.CacheControl = "no-store";

    private async Task<ClientAccount?> FindOwnAccountAsync()
    {
        var clientId = User.ClientId();
        return clientId is null ? null : await _dbContext.ClientAccounts.Include(c => c.Addresses).FirstOrDefaultAsync(c => c.Id == clientId.Value);
    }

    private ClientOwnProfileDto ToDto(ClientAccount account) =>
        new(account.Id, account.Number, account.CompanyName, ClientAddressDto.ListOf(account.Addresses),
            account.Addresses.FirstOrDefault(a => a.IsBilling)?.Key, account.Addresses.FirstOrDefault(a => a.IsDefault)?.Key, account.Status, account.CreatedAt,
            _registration.ToDto(account), account.Status != ClientAccountStatus.Pending);
}
