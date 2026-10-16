using Marvi.Api.Configuration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Marvi.Tests.Support;

/// <summary>MRV-3.3a: the API refuses to start in Production while a secret still holds an example or weak value.</summary>
public class ProductionConfigurationGuardTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value))).Build();

    /// <summary>A configuration a real deployment could have: long random secrets, a real admin, HTTPS.</summary>
    private static (string, string?)[] Good() =>
    [
        ("Jwt:Key", "k7Qx9vL2mZpW4sT8nB1cD6fH0jR3yU5aE7gI9oM2qS4wV6xZ8bN1"),
        ("Seed:AdminEmail", "owner@marvi-distribuidora.example"),
        ("Seed:AdminPassword", "Qz7!rT9vLm2#xWc4"),
        ("PGPASSWORD", "x8Vn2Qd7LpR4sTz9KwB3"),
        ("Cors:AllowedOrigin", "https://loja.marvi.example"),
    ];

    private static (string, string?)[] With(string key, string? value) =>
        Good().Where(v => v.Item1 != key).Append((key, value)).ToArray();

    [Fact]
    public void AConfigurationWithRealSecrets_HasNoProblems() =>
        Assert.Empty(ProductionConfigurationGuard.Problems(Config(Good())));

    [Theory]
    [InlineData("dev-only-placeholder-signing-key-CHANGE-ME-before-production-1234567890")]
    [InlineData("dev-only-compose-signing-key-CHANGE-ME-before-production-1234567890")]
    [InlineData("tooshort")]
    [InlineData("")]
    [InlineData(null)]
    public void AnExampleOrShortJwtKey_IsAProblem(string? key)
    {
        var problems = ProductionConfigurationGuard.Problems(Config(With("Jwt:Key", key)));

        Assert.Single(problems, p => p.Contains("Jwt:Key"));
    }

    [Theory]
    [InlineData("Marvi-Dev-Admin-1!")]
    [InlineData("Admin-Test-1234!")]
    [InlineData("Short1!")]
    public void AnExampleOrShortAdminPassword_IsAProblem(string password)
    {
        var problems = ProductionConfigurationGuard.Problems(Config(With("Seed:AdminPassword", password)));

        Assert.Single(problems, p => p.Contains("Seed:AdminPassword"));
    }

    [Fact]
    public void TheExampleAdminEmail_IsAProblem_ButAbsentSeedingIsFine()
    {
        Assert.Single(ProductionConfigurationGuard.Problems(Config(With("Seed:AdminEmail", "admin@marvi.local"))), p => p.Contains("Seed:AdminEmail"));

        // No seeded admin at all (the admin already exists in the database): nothing to check.
        var withoutSeed = Good().Where(v => !v.Item1.StartsWith("Seed:", StringComparison.Ordinal)).ToArray();
        Assert.Empty(ProductionConfigurationGuard.Problems(Config(withoutSeed)));
    }

    [Theory]
    [InlineData("marvi")]
    [InlineData("postgres")]
    [InlineData("password")]
    [InlineData("short")]
    public void AnExampleOrShortDatabasePassword_IsAProblem(string password)
    {
        var problems = ProductionConfigurationGuard.Problems(Config(With("PGPASSWORD", password)));

        Assert.Single(problems, p => p.Contains("database password"));
    }

    [Fact]
    public void TheDatabasePassword_IsAlsoReadFromTheConnectionString()
    {
        var withoutEnv = Good().Where(v => v.Item1 != "PGPASSWORD").Append(("ConnectionStrings:AppDb", "Host=db;Database=marvi;Username=marvi;Password=marvi")).ToArray();

        Assert.Single(ProductionConfigurationGuard.Problems(Config(withoutEnv)), p => p.Contains("database password"));
    }

    [Theory]
    [InlineData("http://localhost:4200")]
    [InlineData("http://loja.marvi.example")]
    public void ThePublicOrigin_MustBeHttps(string origin)
    {
        Assert.Single(ProductionConfigurationGuard.Problems(Config(With("Cors:AllowedOrigin", origin))), p => p.Contains("Cors:AllowedOrigin"));
    }

    [Fact]
    public void EveryProblem_IsReported_AtOnce_AndNeverRepeatsASecret()
    {
        var bad = Config(
            ("Jwt:Key", "dev-only-placeholder-signing-key-CHANGE-ME-before-production-1234567890"),
            ("Seed:AdminEmail", "admin@marvi.local"),
            ("Seed:AdminPassword", "Marvi-Dev-Admin-1!"),
            ("PGPASSWORD", "marvi"),
            ("Cors:AllowedOrigin", "http://localhost:4200"));

        var problems = ProductionConfigurationGuard.Problems(bad);

        Assert.Equal(5, problems.Count);
        Assert.All(problems, p =>
        {
            Assert.DoesNotContain("Marvi-Dev-Admin-1!", p);
            Assert.DoesNotContain("CHANGE-ME", p);
        });
    }

    [Fact]
    public void TheDevelopmentComposeFlag_IsTheOnlyWayToRunProductionWithExampleValues()
    {
        Assert.True(ProductionConfigurationGuard.IsExemption(Config(("Deployment:AllowExampleSecrets", "true"))));
        Assert.False(ProductionConfigurationGuard.IsExemption(Config(("Deployment:AllowExampleSecrets", "false"))));
        Assert.False(ProductionConfigurationGuard.IsExemption(Config()));
    }

    [Fact]
    public void TheApi_RefusesToStartInProduction_WithTheExampleSecrets_AndSaysWhy()
    {
        using var factory = new ProductionFactory();

        var failure = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        var message = Flatten(failure);
        Assert.Contains("Refusing to start in Production", message);
        Assert.Contains("Jwt:Key", message);
        Assert.DoesNotContain("dev-only-placeholder", message);
    }

    private static string Flatten(Exception exception) =>
        string.Join(" | ", Chain(exception).Select(e => e.Message));

    private static IEnumerable<Exception> Chain(Exception? exception)
    {
        for (var e = exception; e is not null; e = e.InnerException)
        {
            yield return e;
        }
    }

    /// <summary>The real app in the Production environment, with the example values shipped in appsettings.json.</summary>
    private sealed class ProductionFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment("Production");
    }
}
