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

        account.CompanyName = profile.CompanyName;
        account.BillingAddress = profile.BillingAddress;
        account.ShippingAddresses = profile.ShippingAddresses.ToList();
        await _dbContext.SaveChangesAsync();

        return Ok(ToDto(account));
    }

    private async Task<ClientAccount?> FindOwnAccountAsync()
    {
        var clientId = User.ClientId();
        return clientId is null ? null : await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.Id == clientId.Value);
    }

    private static ClientOwnProfileDto ToDto(ClientAccount account) =>
        new(account.Id, account.CompanyName, account.BillingAddress, account.ShippingAddresses, account.Status, account.CreatedAt);
}
