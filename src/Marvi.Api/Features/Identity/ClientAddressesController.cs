using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;

namespace Marvi.Api.Features.Identity;

/// <summary>
/// A customer manages their own addresses (MRV-9.3). Always their own: the account comes from the token and an address is found by its key
/// AND that account, so another customer's key answers 404. Allowed for a suspended customer too (it changes no price and creates
/// nothing). Every change is written to the audit log by <see cref="ClientAddressService"/>.
/// </summary>
[ApiController]
[Route("api/client/addresses")]
[Authorize(Roles = "Client")]
[EnableRateLimiting(RateLimiting.AddressesPolicy)]
public class ClientAddressesController : ControllerBase
{
    private readonly ClientAddressService _addresses;

    public ClientAddressesController(ClientAddressService addresses)
    {
        _addresses = addresses;
    }

    [HttpPost]
    public async Task<ActionResult<ClientAddressDto>> Create(ClientAddressRequest request) =>
        User.ClientId() is { } clientId ? (await _addresses.CreateAsync(clientId, request, "Customer")).ToActionResult(this) : Forbid();

    [HttpPut("{key:guid}")]
    public async Task<ActionResult<ClientAddressDto>> Update(Guid key, ClientAddressRequest request) =>
        User.ClientId() is { } clientId ? (await _addresses.UpdateAsync(clientId, key, request, "Customer")).ToActionResult(this) : Forbid();

    [HttpDelete("{key:guid}")]
    public async Task<ActionResult> Delete(Guid key) =>
        User.ClientId() is { } clientId ? (await _addresses.DeleteAsync(clientId, key, "Customer")).ToActionResult(this) : Forbid();
}

public static class AddressResultExtensions
{
    public static ActionResult ToActionResult(this AddressResult result, ControllerBase controller) => result.Status switch
    {
        200 => controller.Ok(result.Address),
        201 => controller.StatusCode(201, result.Address),
        204 => controller.NoContent(),
        404 => controller.NotFound(),
        409 => controller.Conflict(result.Message),
        _ => controller.BadRequest(result.Message)
    };
}
