using System.Text;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

namespace Marvi.Api.Features.Identity;

public static class IdentityModule
{
    public static readonly string[] Roles = [Principal.Roles.Client, Principal.Roles.Employee, Principal.Roles.Admin];

    public static IServiceCollection AddIdentityFeature(this IServiceCollection services, IConfiguration configuration)
    {
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = configuration["Jwt:Issuer"],
                    ValidateAudience = true,
                    ValidAudience = configuration["Jwt:Audience"],
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSettings.GetKey(configuration))),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.Zero
                };
            });

        services.AddAuthorization();
        services.AddScoped<JwtTokenService>();
        services.AddScoped<ClientAddressService>();

        // Registration data (MRV-9.4). The CPF is stored encrypted with Data Protection, whose keys must survive restarts: a configured folder on a mounted volume
        // (DataProtection:KeysPath). The Testing host uses throwaway keys so the suites never write outside their process.
        var protection = services.AddDataProtection().SetApplicationName("Marvi");
        if (configuration.GetValue<bool>("DataProtection:Ephemeral"))
        {
            protection.UseEphemeralDataProtectionProvider();
        }
        else if (configuration["DataProtection:KeysPath"] is { Length: > 0 } keysPath)
        {
            protection.PersistKeysToFileSystem(new DirectoryInfo(keysPath));
        }

        services.AddSingleton<CpfProtector>();
        services.AddSingleton<IBrazilDate, BrazilDate>();
        services.AddScoped<ClientRegistrationService>();
        return services;
    }

    /// <summary>Ensures the Client/Employee/Admin Identity roles exist; role assignment fails on a fresh database without them.</summary>
    public static async Task SeedRolesAsync(IServiceProvider services)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var roleName in Roles)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(roleName));
            }
        }
    }

    /// <summary>
    /// Creates the first Admin account from <c>Seed:AdminEmail</c> / <c>Seed:AdminPassword</c> when both are configured
    /// and no user with that email exists. Without it nobody could ever create employees or manage the catalog.
    /// </summary>
    public static async Task SeedAdminAsync(IServiceProvider services, IConfiguration configuration)
    {
        var email = configuration["Seed:AdminEmail"];
        var password = configuration["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return;
        }

        var admin = new ApplicationUser { UserName = email, Email = email };
        var created = await userManager.CreateAsync(admin, password);
        if (!created.Succeeded)
        {
            throw new InvalidOperationException(
                "Could not seed the admin account: " + string.Join("; ", created.Errors.Select(e => e.Description)));
        }

        await userManager.AddToRoleAsync(admin, Principal.Roles.Admin);
    }
}
