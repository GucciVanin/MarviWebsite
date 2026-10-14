using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Marvi.Api.Features.Identity;

/// <summary>
/// Who the signed-in user is (MRV-4.7): the identity claims a login puts in the token, and the one place they are read
/// back. Issuing and reading live side by side, so the claim names cannot drift apart (the SPA once decoded the wrong role
/// claim). Token contents are unchanged: <c>sub</c>, the role, and <c>client_id</c> or <c>employee_id</c> when the account has one.
/// </summary>
public static class Principal
{
    public const string ClientIdClaim = "client_id";
    public const string EmployeeIdClaim = "employee_id";

    public static class Roles
    {
        public const string Client = "Client";
        public const string Employee = "Employee";
        public const string Admin = "Admin";
    }

    /// <summary>The claims for a login. An Admin has neither account id; a Client or Employee has theirs when the account exists.</summary>
    public static List<Claim> IssueClaims(Guid userId, string role, Guid? clientAccountId, Guid? employeeAccountId)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(ClaimTypes.Role, role)
        };

        if (clientAccountId is not null)
        {
            claims.Add(new Claim(ClientIdClaim, clientAccountId.Value.ToString()));
        }

        if (employeeAccountId is not null)
        {
            claims.Add(new Claim(EmployeeIdClaim, employeeAccountId.Value.ToString()));
        }

        return claims;
    }

    /// <summary>The Customer account the token belongs to, or null (not a customer, or the account record is missing).</summary>
    public static Guid? ClientId(this ClaimsPrincipal user) => ReadGuid(user, ClientIdClaim);

    /// <summary>The Employee account the token belongs to, or null (an Admin has none).</summary>
    public static Guid? EmployeeId(this ClaimsPrincipal user) => ReadGuid(user, EmployeeIdClaim);

    /// <summary>The login user. <c>sub</c> is remapped to NameIdentifier by the default inbound claim map, so both are checked.</summary>
    public static Guid? UserId(this ClaimsPrincipal user) =>
        ReadGuid(user, JwtRegisteredClaimNames.Sub) ?? ReadGuid(user, ClaimTypes.NameIdentifier);

    /// <summary>
    /// Staff work (pricing quotes, placing orders): an Employee acts as themselves, an Admin acts with no employee
    /// (<paramref name="employeeId"/> null, recorded as nobody). Anyone else, including an Employee token without an
    /// account record, may not.
    /// </summary>
    public static bool CanActAsStaff(this ClaimsPrincipal user, out Guid? employeeId)
    {
        employeeId = user.EmployeeId();
        return employeeId is not null || user.IsInRole(Roles.Admin);
    }

    private static Guid? ReadGuid(ClaimsPrincipal user, string claimType) =>
        Guid.TryParse(user.FindFirst(claimType)?.Value, out var id) ? id : null;
}
