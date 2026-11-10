using Marvi.Domain.Catalog;

namespace Marvi.Api.Features.Catalog.Media;

/// <summary>
/// Where product photos live on disk (MRV-9.7): ONE flat folder, <c>Media:Path</c>, which in a deployment is a persistent volume (compose mounts
/// <c>/media</c>). Only names that <see cref="ProductPhotoRules.IsStoredName"/> accepts ever reach the disk, so no caller can write or read
/// outside the folder; every method re-checks the name. A file is written under a temporary name and moved in place, so a reader never sees half a photo.
/// </summary>
public sealed class ProductPhotoStorage
{
    public const string ConfigKey = "Media:Path";

    private readonly string _root;

    public ProductPhotoStorage(IConfiguration configuration)
    {
        var configured = configuration[ConfigKey];
        // Outside Production the folder may be left unset (a developer running the API directly): it then sits next to the build output.
        // The Production guard refuses to start without it, so a real deployment can never lose its photos with a container.
        _root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Path.Combine(AppContext.BaseDirectory, "media") : configured);
        Directory.CreateDirectory(_root);
    }

    public string Root => _root;

    public async Task SaveAsync(string fileName, ReadOnlyMemory<byte> bytes, CancellationToken cancellationToken)
    {
        var target = PathOf(fileName);
        var temporary = Path.Combine(_root, $".{Guid.NewGuid():N}.tmp");
        try
        {
            await File.WriteAllBytesAsync(temporary, bytes.ToArray(), cancellationToken);
            File.Move(temporary, target, overwrite: false);
        }
        finally
        {
            File.Delete(temporary);
        }
    }

    /// <summary>The full path of an existing stored photo, or null (unknown name, bad name, missing file).</summary>
    public string? Find(string? fileName)
    {
        if (!ProductPhotoRules.IsStoredName(fileName))
        {
            return null;
        }

        var path = PathOf(fileName!);
        return File.Exists(path) ? path : null;
    }

    /// <summary>Removes a stored photo; a name that is not ours or a file already gone is not an error (the caller has nothing else to do).</summary>
    public void Delete(string? fileName)
    {
        if (!ProductPhotoRules.IsStoredName(fileName))
        {
            return;
        }

        try
        {
            File.Delete(PathOf(fileName!));
        }
        catch (IOException)
        {
            // Left for the cleanup, which removes any photo nothing refers to.
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    /// <summary>Every stored photo with the time it was written (for the cleanup of files nothing refers to).</summary>
    public IEnumerable<(string FileName, DateTime WrittenUtc)> List() =>
        Directory.EnumerateFiles(_root)
            .Select(path => (Name: Path.GetFileName(path), Written: File.GetLastWriteTimeUtc(path)))
            .Where(f => ProductPhotoRules.IsStoredName(f.Name))
            .Select(f => (f.Name, f.Written));

    /// <summary>Removes the half-written files (<c>.{guid}.tmp</c>) a crash left behind, older than <paramref name="cutoff"/>; returns how many.</summary>
    public int DeleteStaleTemporaryFiles(DateTime cutoff)
    {
        var removed = 0;
        foreach (var path in Directory.EnumerateFiles(_root, ".*.tmp"))
        {
            try
            {
                if (File.GetLastWriteTimeUtc(path) < cutoff)
                {
                    File.Delete(path);
                    removed++;
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        return removed;
    }

    private string PathOf(string fileName)
    {
        if (!ProductPhotoRules.IsStoredName(fileName))
        {
            throw new ArgumentException("Not a stored photo name.", nameof(fileName));
        }

        var path = Path.GetFullPath(Path.Combine(_root, fileName));
        if (!path.StartsWith(_root, StringComparison.Ordinal))
        {
            throw new ArgumentException("Outside the media folder.", nameof(fileName));
        }

        return path;
    }
}
