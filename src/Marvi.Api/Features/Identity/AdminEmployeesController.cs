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
            EmployeeCode = request.EmployeeCode,
            Department = request.Department,
            HireDate = request.HireDate
        };

        _dbContext.EmployeeAccounts.Add(employeeAccount);
        await _dbContext.SaveChangesAsync();

        await _auditLogger.LogAsync("Create", nameof(EmployeeAccount), employeeAccount.Id, new { request.Email, request.EmployeeCode, request.Department });

        return Created(string.Empty, new { employeeAccount.Id });
    }
}
