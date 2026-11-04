using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Identity;

/// <summary>What the startup check of the CPF hash key found.</summary>
public enum CpfKeyCheckResult
{
    /// <summary>First start with this feature: the fingerprint was stored.</summary>
    Recorded,
    /// <summary>The configured key is the one the database was written with.</summary>
    Matches,
    /// <summary>The configured key is not the one the stored CPF hashes were made with.</summary>
    Mismatch,
}

/// <summary>
/// Startup canary for <c>Privacy:CpfHashKey</c> (MRV-9.4 security review). The key makes CPFs unique without storing them; changing it silently
/// would make every old hash stop matching, so the same CPF could register again. The first start stores a keyed fingerprint of the key in
/// <c>app_settings</c>; every later start compares it. A mismatch refuses to start in Production (the message says what to do) and only logs a
/// warning in Development. The fingerprint reveals nothing about any CPF.
/// </summary>
public static class CpfKeyCheck
{
    public const string SettingKey = "cpf_hash_key_fingerprint";

    public static async Task<CpfKeyCheckResult> RunAsync(AppDbContext db, CpfProtector cpf)
    {
        var current = cpf.KeyFingerprint();
        var stored = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == SettingKey);
        if (stored is null)
        {
            db.AppSettings.Add(new AppSetting { Key = SettingKey, Value = current });
            await db.SaveChangesAsync();
            return CpfKeyCheckResult.Recorded;
        }

        return stored.Value == current ? CpfKeyCheckResult.Matches : CpfKeyCheckResult.Mismatch;
    }

    /// <summary>Runs the check at startup and applies the policy: Production throws on a mismatch, anything else logs a warning.</summary>
    public static async Task EnsureAsync(IServiceProvider services, IHostEnvironment environment, ILogger logger)
    {
        var result = await RunAsync(services.GetRequiredService<AppDbContext>(), services.GetRequiredService<CpfProtector>());
        if (result != CpfKeyCheckResult.Mismatch)
        {
            return;
        }

        const string message = "Privacy:CpfHashKey is not the key this database was written with. Changing it would make every stored CPF hash stop matching, so the same CPF could register again. "
            + "Restore the original key. (A deliberate rotation needs the stored CPFs re-hashed first; see docs/operations.md section 7.)";
        if (environment.IsProduction())
        {
            throw new InvalidOperationException("Refusing to start in Production: " + message);
        }

        logger.LogWarning("{Message}", message);
    }
}
