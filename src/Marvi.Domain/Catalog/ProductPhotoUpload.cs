namespace Marvi.Domain.Catalog;

/// <summary>
/// A product photo that was uploaded and not yet linked to a product (MRV-9.7). The row exists only while the photo waits: it is deleted in the
/// SAME save that links the file to the product, so a token can be used once. <see cref="Token"/> is 128 random bits in hex and is also the stem
/// of the stored file name. Uploads nobody links within <see cref="ProductPhotoRules.PendingLifetime"/> are removed with their file.
/// </summary>
public class ProductPhotoUpload
{
    public string Token { get; set; } = string.Empty;
    /// <summary>The stored file name: the token plus the extension (<c>.jpg</c>, <c>.png</c> or <c>.webp</c>).</summary>
    public string FileName { get; set; } = string.Empty;
    /// <summary>The admin who uploaded it; only that admin can link it.</summary>
    public Guid UploadedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}
