using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Marvi.Api.Features.Identity;

/// <summary>Issues the signed JWT access tokens validated by the bearer middleware.</summary>
public class JwtTokenService
{
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(1);

    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public (string Token, DateTime ExpiresAt) CreateToken(IEnumerable<Claim> claims)
    {
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSettings.GetKey(_configuration)));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var expiresAt = DateTime.UtcNow.Add(TokenLifetime);

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}

internal static class JwtSettings
{
    public static string GetKey(IConfiguration configuration) =>
        configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
}
