using Marvi.Api.Configuration;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Catalog;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
[EnableRateLimiting(RateLimiting.AuthPolicy)]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AppDbContext _dbContext;
    private readonly JwtTokenService _tokenService;
    private readonly ClientRegistrationService _registration;
    private readonly ILogger<AuthController> _logger;

    public AuthController(UserManager<ApplicationUser> userManager, AppDbContext dbContext, JwtTokenService tokenService, ClientRegistrationService registration, ILogger<AuthController> logger)
    {
        _logger = logger;
        _userManager = userManager;
        _dbContext = dbContext;
        _tokenService = tokenService;
        _registration = registration;
    }

    // Tighter than sign-in (the class default): a registration is also a CNPJ/CPF probe and creates an account.
    [HttpPost("register")]
    [EnableRateLimiting(RateLimiting.RegisterPolicy)]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        if (!EmailAddressValidator.IsValid(request.Email))
        {
            return BadRequest(new[] { "Invalid email address." });
        }

        // The account type and its data (MRV-9.4); without a type this is a business account. Checked before the user is created.
        var type = request.AccountType ?? AccountType.Business;
        var (prepared, problems) = _registration.Validate(type, request.CompanyName, request.Registration?.ToInput(), existingCpf: false);
        if (prepared is null)
        {
            return BadRequest(problems);
        }

        if (await _registration.IsDuplicateAsync(null, prepared.Data))
        {
            return Conflict(new[] { ClientRegistrationService.DuplicateMessage });
        }

        // The first address is the billing address and the default delivery address (MRV-9.3). Checked before the user is created.
        var (address, addressProblem) = ClientAddressRules.Check(request.BillingAddress?.ToInput(), ClientAddressRules.DefaultLabel, ClientAddressKind.Both);
        if (address is null)
        {
            return BadRequest(new[] { addressProblem });
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
            CreatedAt = DateTime.UtcNow,
            PricingTierId = defaultTier.Id,
            // Least privilege (owner decision, MRV-5.3): a new customer can do nothing but read and edit their own details until
            // an admin approves them with an explicit pricing tier.
            Status = ClientAccountStatus.Pending
        };

        _registration.Apply(clientAccount, prepared);
        _dbContext.ClientAccounts.Add(clientAccount);
        _dbContext.ClientAddresses.Add(new ClientAddress
        {
            Id = Guid.NewGuid(),
            Key = Guid.NewGuid(),
            ClientAccountId = clientAccount.Id,
            CreatedAt = clientAccount.CreatedAt,
            Label = address.Label,
            Kind = ClientAddressKind.Both,
            PostalCode = address.PostalCode,
            Street = address.Street,
            Number = address.Number,
            Complement = address.Complement,
            District = address.District,
            City = address.City,
            State = address.State,
            DeliveryNotes = address.DeliveryNotes,
            IsBilling = true,
            IsDefault = true
        });
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueViolationOf(ClientRegistrationService.DuplicateIndexes))
        {
            // Another registration took the same CNPJ or CPF between the check and the save: do not leave the login behind. The failed save left the new
            // account in the change tracker; forget it first, or removing the login would try to save it again and fail the same way.
            _dbContext.ChangeTracker.Clear();
            var removed = await _userManager.DeleteAsync(user);
            if (!removed.Succeeded)
            {
                // No e-mail, no registration data: only that a login could not be removed, so someone can look at it.
                _logger.LogWarning("A login created during a registration that then failed could not be removed ({ErrorCount} errors).", removed.Errors.Count());
            }

            return Conflict(new[] { ClientRegistrationService.DuplicateMessage });
        }

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
