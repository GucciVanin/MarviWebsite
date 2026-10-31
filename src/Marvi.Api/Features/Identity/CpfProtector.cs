using System.Security.Cryptography;
using System.Text;
using Marvi.Domain.Identity;
using Microsoft.AspNetCore.DataProtection;

namespace Marvi.Api.Features.Identity;

/// <summary>
/// The only code that touches a CPF in the clear (MRV-9.4, LGPD): it encrypts it with ASP.NET Data Protection for storage, unprotects it for the
/// audited admin reveal and for masking, and hashes it with a key (HMAC-SHA256, <c>Privacy:CpfHashKey</c>) so two accounts cannot share a CPF without
/// the hash revealing it. The Data Protection keys must survive restarts (a mounted volume, <c>DataProtection:KeysPath</c>): without them the stored
/// CPFs cannot be decrypted any more, which is why <see cref="MaskedOf"/> degrades to a generic mask instead of failing.
/// </summary>
public class CpfProtector
{
    public const string HashKeySetting = "Privacy:CpfHashKey";
    private const string Purpose = "Marvi.ClientAccount.Cpf.v1";
    private const string Unavailable = "***.***.***-**";

    private readonly IDataProtector _protector;
    private readonly byte[] _hashKey;

    public CpfProtector(IDataProtectionProvider provider, IConfiguration configuration)
    {
        _protector = provider.CreateProtector(Purpose);
        var key = configuration[HashKeySetting];
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException($"{HashKeySetting} is not set.");
        }

        _hashKey = Encoding.UTF8.GetBytes(key);
    }

    /// <summary>The encrypted form of a normalised CPF (what the database stores).</summary>
    public string Protect(string cpf) => _protector.Protect(cpf);

    /// <summary>The keyed hash of a normalised CPF (lower-case hex), for the uniqueness index.</summary>
    public string Hash(string cpf) => Convert.ToHexStringLower(HMACSHA256.HashData(_hashKey, Encoding.UTF8.GetBytes(cpf)));

    /// <summary>
    /// A fingerprint of the hash key itself (HMAC of a fixed phrase, lower-case hex). It is safe to store next to the data: it says nothing about any CPF,
    /// and is what <see cref="CpfKeyCheck"/> compares at startup to notice that the key was changed.
    /// </summary>
    public string KeyFingerprint() => Convert.ToHexStringLower(HMACSHA256.HashData(_hashKey, Encoding.UTF8.GetBytes("marvi.cpf-hash-key.fingerprint.v1")));

    /// <summary>The CPF in the clear, or null when none is stored or it cannot be decrypted (keys lost).</summary>
    public string? Reveal(ClientAccount account)
    {
        if (account.CpfProtected is null)
        {
            return null;
        }

        try
        {
            return _protector.Unprotect(account.CpfProtected);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    /// <summary>The form staff and logs may show (<c>***.456.789-**</c>), null when the account has no CPF.</summary>
    public string? MaskedOf(ClientAccount account) =>
        account.CpfProtected is null ? null : Reveal(account) is { } cpf ? CpfRules.Mask(cpf) : Unavailable;
}
