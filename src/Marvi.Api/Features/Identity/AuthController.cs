using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Catalog;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AppDbContext _dbContext;
    private readonly JwtTokenService _tokenService;

    public AuthController(UserManager<ApplicationUser> userManager, AppDbContext dbContext, JwtTokenService tokenService)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _tokenService = tokenService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        if (!EmailAddressValidator.IsValid(request.Email))
        {
            return BadRequest(new[] { "Invalid email address." });
        }

        var (profile, problem) = ClientProfileRules.Check(request.CompanyName, request.BillingAddress);
        if (profile is null)
        {
            return BadRequest(new[] { problem });
        }

        var defaultTier = await DefaultPricingTier.GetOrCreateAsync(_dbContext);

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email
        };

        var createResult = await _userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            return BadRequest(createResult.Errors.Select(e => e.Description));
        }

        await _userManager.AddToRoleAsync(user, "Client");

        var clientAccount = new ClientAccount
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            CompanyName = profile.CompanyName,
            BillingAddress = profile.BillingAddress,
            PricingTierId = defaultTier.Id,
            // Clients get access immediately; admins can suspend them afterwards.
            Status = ClientAccountStatus.Approved
        };

        _dbContext.ClientAccounts.Add(clientAccount);
        await _dbContext.SaveChangesAsync();

        return Created(string.Empty, new { clientAccount.Id });
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !await _userManager.CheckPasswordAsync(user, request.Password))
        {
            return Unauthorized();
        }

        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? string.Empty;

        Guid? clientAccountId = null;
        Guid? employeeAccountId = null;
        if (string.Equals(role, Principal.Roles.Client, StringComparison.OrdinalIgnoreCase))
        {
            clientAccountId = (await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.UserId == user.Id))?.Id;
        }
        else if (string.Equals(role, Principal.Roles.Employee, StringComparison.OrdinalIgnoreCase))
        {
            employeeAccountId = (await _dbContext.EmployeeAccounts.FirstOrDefaultAsync(e => e.UserId == user.Id))?.Id;
        }

        var (token, expiresAt) = _tokenService.CreateToken(Principal.IssueClaims(user.Id, role, clientAccountId, employeeAccountId));

        return Ok(new AuthResponse(token, expiresAt));
    }
}
