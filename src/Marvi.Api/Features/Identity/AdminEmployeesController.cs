using Marvi.Api.Features.Admin;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Marvi.Api.Features.Identity;

[ApiController]
[Route("api/admin/employees")]
[Authorize(Roles = "Admin")]
public class AdminEmployeesController : ControllerBase
{
    private const int MaxEmployeeCodeLength = 50;

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AppDbContext _dbContext;
    private readonly AuditLogger _auditLogger;

    public AdminEmployeesController(UserManager<ApplicationUser> userManager, AppDbContext dbContext, AuditLogger auditLogger)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _auditLogger = auditLogger;
    }

    // The only place in the app allowed to create a user with role Employee.
    [HttpPost]
    public async Task<IActionResult> Create(CreateEmployeeRequest request)
    {
        if (!EmailAddressValidator.IsValid(request.Email))
        {
            return BadRequest(new[] { "Invalid email address." });
        }

        var employeeCode = AdminInput.Clean(request.EmployeeCode);
        if (AdminInput.IsBlank(employeeCode) || AdminInput.ExceedsLength(employeeCode, MaxEmployeeCodeLength))
        {
            return BadRequest(new[] { $"Employee code is required and limited to {MaxEmployeeCodeLength} characters." });
        }

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

        await _userManager.AddToRoleAsync(user, "Employee");

        var employeeAccount = new EmployeeAccount
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            EmployeeCode = employeeCode,
            Department = request.Department,
            HireDate = request.HireDate
        };

        _dbContext.EmployeeAccounts.Add(employeeAccount);
        if (!await _auditLogger.TrySaveAsync(AuditActions.Create, nameof(EmployeeAccount), employeeAccount.Id, new { request.Email, request.EmployeeCode, request.Department }))
        {
            return Conflict(AuditLogger.ConflictMessage);
        }

        return Created(string.Empty, new { employeeAccount.Id });
    }
}
