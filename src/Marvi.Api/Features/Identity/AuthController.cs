using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
    private const int MaxCompanyNameLength = 200;
    private const int MaxAddressLength = 500;

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

        var companyName = request.CompanyName?.Trim();
        var billingAddress = request.BillingAddress?.Trim();
        if (string.IsNullOrWhiteSpace(companyName) || string.IsNullOrWhiteSpace(billingAddress))
        {
            return BadRequest(new[] { "Company name and billing address are required." });
        }

        if (companyName.Length > MaxCompanyNameLength || billingAddress.Length > MaxAddressLength)
        {
            return BadRequest(new[] { $"Company name is limited to {MaxCompanyNameLength} characters and the address to {MaxAddressLength}." });
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
            CompanyName = companyName,
            BillingAddress = billingAddress,
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

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.Role, role)
        };

        if (string.Equals(role, "Client", StringComparison.OrdinalIgnoreCase))
        {
            var clientAccount = await _dbContext.ClientAccounts.FirstOrDefaultAsync(c => c.UserId == user.Id);
            if (clientAccount is not null)
            {
                claims.Add(new Claim("client_id", clientAccount.Id.ToString()));
            }
        }
        else if (string.Equals(role, "Employee", StringComparison.OrdinalIgnoreCase))
        {
            var employeeAccount = await _dbContext.EmployeeAccounts.FirstOrDefaultAsync(e => e.UserId == user.Id);
            if (employeeAccount is not null)
            {
                claims.Add(new Claim("employee_id", employeeAccount.Id.ToString()));
            }
        }

        var (token, expiresAt) = _tokenService.CreateToken(claims);

        return Ok(new AuthResponse(token, expiresAt));
    }
}
