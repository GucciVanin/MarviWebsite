using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Catalog;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

[ApiController]
[Route("api/employee/clients")]
[Authorize(Roles = "Employee,Admin")]
public class EmployeeClientsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly ClientRegistrationService _registration;

    public EmployeeClientsController(AppDbContext dbContext, ClientRegistrationService registration)
    {
        _dbContext = dbContext;
        _registration = registration;
    }

    /// <summary>
    /// The customer directory (MRV-2.4b.1): find customers by part of the company name (ignoring case), A to Z, paged.
    /// Without a search it lists everyone.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<ClientSummaryDto>>> Search(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize)
    {
        var problem = Paging.Validate(page, pageSize);
        if (problem is not null)
        {
            return BadRequest(problem);
        }

        var query = _dbContext.ClientAccounts.AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(c => c.CompanyName.ToLower().Contains(term));
        }

        var total = await query.CountAsync();
        var (size, skip) = Paging.Resolve(page, pageSize);
        var clients = await query
            .Include(c => c.PricingTier)
            .OrderBy(c => c.CompanyName.ToLower()).ThenBy(c => c.Id)
            .Skip(skip)
            .Take(size)
            .ToListAsync();

        var items = clients.Select(c => new ClientSummaryDto(c.Id, c.Number, c.CompanyName, c.Status, c.PricingTierId, c.PricingTier?.Name, c.CreatedAt, c.AccountType)).ToList();
        return Ok(new PagedResult<ClientSummaryDto>(items, page, size, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ClientProfileDto>> GetClient(Guid id)
    {
        Response.Headers.CacheControl = "no-store"; // the registration data (birth date, CPF mask) is not kept by browsers or proxies
        var clientAccount = await _dbContext.ClientAccounts
            .Include(c => c.PricingTier)
            .FirstOrDefaultAsync(c => c.Id == id);
        return clientAccount is null ? NotFound() : Ok(await ToProfileAsync(clientAccount));
    }

    /// <summary>
    /// The same customer as <c>GET {id}</c>, found by the customer number (MRV-9.1) so a screen can address a customer without an id in
    /// its URL. 400 when the number is not digits, 404 when no customer has it.
    /// </summary>
    [HttpGet("by-number/{number}")]
    public async Task<ActionResult<ClientProfileDto>> GetClientByNumber(string number)
    {
        Response.Headers.CacheControl = "no-store";
        if (!CustomerNumbers.TryParse(number, out var parsed))
        {
            return BadRequest(CustomerNumbers.NotANumber);
        }

        var clientAccount = await _dbContext.ClientAccounts
            .Include(c => c.PricingTier)
            .FirstOrDefaultAsync(c => c.Number == parsed);
        return clientAccount is null ? NotFound() : Ok(await ToProfileAsync(clientAccount));
    }

    private async Task<ClientProfileDto> ToProfileAsync(ClientAccount clientAccount)
    {
        var id = clientAccount.Id;
        var quotes = await _dbContext.Quotes
            .Include(q => q.LineItems).ThenInclude(li => li.Product)
            .Where(q => q.ClientAccountId == id)
            .ToListAsync();

        var orders = await _dbContext.Orders
            .Include(o => o.LineItems).ThenInclude(li => li.Product)
            .Where(o => o.ClientAccountId == id)
            .ToListAsync();

        var addresses = await _dbContext.ClientAddresses.Where(a => a.ClientAccountId == id).ToListAsync();

        var email = await _dbContext.Users.Where(u => u.Id == clientAccount.UserId).Select(u => u.Email).FirstOrDefaultAsync();

        return new ClientProfileDto(
            clientAccount.Id,
            clientAccount.Number,
            clientAccount.CompanyName,
            clientAccount.CreatedAt,
            ClientAddressDto.ListOf(addresses),
            addresses.FirstOrDefault(a => a.IsBilling)?.Key,
            addresses.FirstOrDefault(a => a.IsDefault)?.Key,
            clientAccount.PricingTier?.Name,
            clientAccount.Status,
            quotes.Select(ToQuoteDto).ToList(),
            orders.Select(ToOrderDto).ToList(),
            email,
            _registration.ToDto(clientAccount));
    }

    private static QuoteDto ToQuoteDto(Quote quote) => QuoteDto.From(quote);

    private static OrderDto ToOrderDto(Order order) => OrderDto.From(order);
}
