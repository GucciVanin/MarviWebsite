using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Marvi.Api.Configuration;

/// <summary>
/// MRV-3.3a: the API refuses to start in Production while a secret still holds an example or weak value. The repository ships
/// working development values (appsettings.json, deploy/.env.example) so everything runs locally; a straight copy of them into a
/// real deployment would be a vulnerability, so Production insists on real ones. The messages name the setting, never its value.
/// The development and runtime-suite compose stacks run the API image (which is Production by default) with the example values,
/// and say so explicitly with <c>Deployment:AllowExampleSecrets=true</c>; a real deployment must not set it.
/// </summary>
public static class ProductionConfigurationGuard
{
    public const string ExemptionKey = "Deployment:AllowExampleSecrets";

    private const int MinJwtKeyLength = 32;
    private const int MinPasswordLength = 12;

    private static readonly string[] ExampleMarkers = ["change-me", "dev-only", "placeholder", "example-value"];
    private static readonly string[] ExampleAdminPasswords = ["Marvi-Dev-Admin-1!", "Admin-Test-1234!"];
    private static readonly string[] WeakDatabasePasswords = ["marvi", "postgres", "password", "admin", "root", "123456"];

    /// <summary>True for the explicit, loud opt-out used by the development and runtime-suite compose stacks.</summary>
    public static bool IsExemption(IConfiguration configuration) => configuration.GetValue<bool>(ExemptionKey);

    /// <summary>Throws, listing every problem at once, when this is Production and the configuration is not safe for it.</summary>
    public static void EnsureSafe(IConfiguration configuration, IHostEnvironment environment)
    {
        if (!environment.IsProduction() || IsExemption(configuration))
        {
            return;
        }

        var problems = Problems(configuration);
        if (problems.Count > 0)
        {
            throw new InvalidOperationException(
                "Refusing to start in Production: " + string.Join(" ", problems) +
                " Set real values through environment variables or a secret store (see docs/operations.md).");
        }
    }

    public static IReadOnlyList<string> Problems(IConfiguration configuration)
    {
        var problems = new List<string>();

        var jwtKey = configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
        {
            problems.Add("Jwt:Key is not set.");
        }
        else if (jwtKey.Length < MinJwtKeyLength)
        {
            problems.Add($"Jwt:Key is shorter than {MinJwtKeyLength} characters.");
        }
        else if (HoldsAnExample(jwtKey))
        {
            problems.Add("Jwt:Key still holds an example value.");
        }

        var adminEmail = configuration["Seed:AdminEmail"];
        if (!string.IsNullOrWhiteSpace(adminEmail) && adminEmail.EndsWith("@marvi.local", StringComparison.OrdinalIgnoreCase))
        {
            problems.Add("Seed:AdminEmail is the example address.");
        }

        var adminPassword = configuration["Seed:AdminPassword"];
        if (!string.IsNullOrWhiteSpace(adminPassword)
            && (ExampleAdminPasswords.Contains(adminPassword) || HoldsAnExample(adminPassword) || adminPassword.Length < MinPasswordLength))
        {
            problems.Add($"Seed:AdminPassword is an example value or shorter than {MinPasswordLength} characters.");
        }

        var databasePassword = DatabasePassword(configuration);
        if (databasePassword is not null
            && (WeakDatabasePasswords.Contains(databasePassword, StringComparer.OrdinalIgnoreCase) || databasePassword.Length < MinPasswordLength))
        {
            problems.Add($"The database password is an example value or shorter than {MinPasswordLength} characters.");
        }

        var origin = configuration["Cors:AllowedOrigin"];
        if (!string.IsNullOrWhiteSpace(origin) && !origin.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            problems.Add("Cors:AllowedOrigin must be the https address of the site.");
        }

        return problems;
    }

    private static bool HoldsAnExample(string value) =>
        ExampleMarkers.Any(marker => value.Contains(marker, StringComparison.OrdinalIgnoreCase));

    /// <summary>The database password: PGPASSWORD (what compose passes) or the Password= part of the connection string; null when neither is set.</summary>
    private static string? DatabasePassword(IConfiguration configuration)
    {
        var fromEnvironment = configuration["PGPASSWORD"];
        if (!string.IsNullOrEmpty(fromEnvironment))
        {
            return fromEnvironment;
        }

        var connectionString = configuration["ConnectionStrings:AppDb"];
        return connectionString?
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(part => part.Split('=', 2))
            .Where(pair => pair.Length == 2 && pair[0].Equals("Password", StringComparison.OrdinalIgnoreCase))
            .Select(pair => pair[1])
            .FirstOrDefault();
    }
}
