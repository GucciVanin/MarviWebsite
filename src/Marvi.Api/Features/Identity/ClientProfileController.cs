using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

/// <summary>A customer reads and edits their own company details (MRV-2.2). Always their own: the account comes from the token, never from the request.</summary>
[ApiController]
[Route("api/client/profile")]
[Authorize(Roles = "Client")]
public class ClientProfileController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public ClientProfileController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<ClientOwnProfileDto>> Get()
    {
        var account = await FindOwnAccountAsync();
        return account is null ? Forbid() : Ok(ToDto(account));
    }

    /// <summary>
    /// Replaces the company name, billing address and the whole list of shipping addresses. Allowed for a suspended
    /// customer too: it changes no price and creates nothing. Customer self-edits are not admin mutations, so they are not audited.
    /// </summary>
    [HttpPut]
    public async Task<ActionResult<ClientOwnProfileDto>> Update(UpdateClientProfileRequest request)
    {
        var account = await FindOwnAccountAsync();
        if (account is null)
        {
            return Forbid();
        }

        var (profile, problem) = ClientProfileRules.Check(request.CompanyName, request.BillingAddress, request.ShippingAddresses);
        if (profile is null)
        {
            return BadRequest(problem);
        }

        // The customer's status is a concurrency token (MRV-6.1), so an admin deciding this customer at the same moment makes
        // this save fail once. Their decision does not touch these fields: read the row again and apply the edit on top of it.
        for (var attempt = 0; ; attempt++)
        {
            account.CompanyName = profile.CompanyName;
            account.BillingAddress = profile.BillingAddress;
            account.ShippingAddresses = profile.ShippingAddresses.ToList();
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
        }
    }

    private async Task<ClientAccount?> FindOwnAccountAsync()
    {
        var clientId = User.ClientId();
        return clientId is null ? null : await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.Id == clientId.Value);
    }

    private static ClientOwnProfileDto ToDto(ClientAccount account) =>
        new(account.Id, account.Number, account.CompanyName, account.BillingAddress, account.ShippingAddresses, account.Status, account.CreatedAt);
}
