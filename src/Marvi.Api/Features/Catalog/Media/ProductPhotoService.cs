using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog.Media;

/// <summary>
/// Links an uploaded photo to a product (MRV-9.7) inside the product's OWN save: the create and the edit endpoints of the one product path call
/// <see cref="ResolveAsync"/>, set the product's image path and remove the upload row; the caller's single audited save commits all of it or none.
/// There is no separate "attach photo" write. The cleanup removes uploads nobody linked and files nothing refers to.
/// </summary>
public sealed class ProductPhotoService
{
    private readonly AppDbContext _dbContext;
    private readonly ProductPhotoStorage _storage;
    private readonly TimeProvider _clock;
    private static readonly TimeSpan Grace = TimeSpan.FromMinutes(10);

    public ProductPhotoService(AppDbContext dbContext, ProductPhotoStorage storage, TimeProvider clock)
    {
        _dbContext = dbContext;
        _storage = storage;
        _clock = clock;
    }

    /// <summary>
    /// The pending upload for a token, or a problem on field <c>photo</c> when the token is malformed, unknown, already used, expired or another
    /// admin's (one message for all of them: nothing about the token is revealed).
    /// </summary>
    public async Task<(ProductPhotoUpload? Upload, ProductProblem? Problem)> ResolveAsync(string token, Guid adminUserId)
    {
        var problem = new ProductProblem(ProductPhotoRules.Field, ProductPhotoRules.TokenMessage);
        if (!ProductPhotoRules.IsToken(token))
        {
            return (null, problem);
        }

        var upload = await _dbContext.ProductPhotoUploads.FirstOrDefaultAsync(u => u.Token == token);
        var expired = upload is not null && _clock.GetUtcNow().UtcDateTime - upload.CreatedAt > ProductPhotoRules.PendingLifetime;
        if (upload is null || upload.UploadedByUserId != adminUserId || expired || _storage.Find(upload.FileName) is null)
        {
            return (null, problem);
        }

        return (upload, null);
    }

    /// <summary>True when no waiting upload has this token any more (another request used it, or it was cleaned up).</summary>
    public async Task<bool> IsSpentAsync(string token) => !await _dbContext.ProductPhotoUploads.AsNoTracking().AnyAsync(u => u.Token == token);

    /// <summary>Removes the stored file of a product's previous photo after the save that replaced or cleared it succeeded.</summary>
    public void DeleteFileOf(string? imageUrl) => _storage.Delete(ProductPhotoRules.FileNameOf(imageUrl));

    /// <summary>
    /// The cleanup: uploads older than the pending lifetime are removed with their file, and so is any stored photo older than that which no
    /// product and no upload refers to (a file left behind by a failed delete or a crash), and so is any half-written temporary file that old. Returns how many files were removed.
    /// </summary>
    public async Task<int> CleanupAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        // A grace period past the lifetime a token is accepted for: a save that resolved a token just before it expired must not lose its file to a tick already running.
        var cutoff = now - ProductPhotoRules.PendingLifetime - Grace;
        var removed = 0;

        var expired = await _dbContext.ProductPhotoUploads.Where(u => u.CreatedAt < cutoff).ToListAsync(cancellationToken);
        // Rows first: only the files whose rows were really removed are deleted (a row a product save just spent makes the delete fail and its file stays).
        _dbContext.ProductPhotoUploads.RemoveRange(expired);
        await _dbContext.SaveChangesAsync(cancellationToken);
        foreach (var upload in expired)
        {
            _storage.Delete(upload.FileName);
            removed++;
        }

        var used = (await _dbContext.Products.Where(p => p.ImageUrl != null).Select(p => p.ImageUrl!).ToListAsync(cancellationToken))
            .Select(ProductPhotoRules.FileNameOf).Where(n => n is not null).ToHashSet();
        used.UnionWith(await _dbContext.ProductPhotoUploads.Select(u => u.FileName).ToListAsync(cancellationToken));
        foreach (var (fileName, written) in _storage.List())
        {
            if (written < cutoff && !used.Contains(fileName))
            {
                _storage.Delete(fileName);
                removed++;
            }
        }

        return removed + _storage.DeleteStaleTemporaryFiles(cutoff);
    }
}
