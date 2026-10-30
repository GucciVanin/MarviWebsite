using Marvi.Api.Features.Identity.Contracts;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

/// <summary>The admin customers tab's own lookups (MRV-9.1): a customer by customer number, so no id has to be in a URL.</summary>
[ApiController]
[Route("api/admin/customers")]
[Authorize(Roles = "Admin")]
public class AdminCustomersController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public AdminCustomersController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    /// <summary>One customer as the admin customers list shows them. 400 when the number is not digits, 404 when no customer has it.</summary>
    [HttpGet("by-number/{number}")]
    public async Task<ActionResult<ClientSummaryDto>> GetByNumber(string number)
    {
        if (!CustomerNumbers.TryParse(number, out var parsed))
        {
            return BadRequest(CustomerNumbers.NotANumber);
        }

        var client = await _dbContext.ClientAccounts
            .Include(c => c.PricingTier)
            .FirstOrDefaultAsync(c => c.Number == parsed);
        return client is null
            ? NotFound()
            : Ok(new ClientSummaryDto(client.Id, client.Number, client.CompanyName, client.Status, client.PricingTierId, client.PricingTier?.Name, client.CreatedAt));
    }
}
