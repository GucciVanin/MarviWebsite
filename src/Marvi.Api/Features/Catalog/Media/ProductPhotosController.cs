using System.Security.Cryptography;
using Marvi.Api.Configuration;
using Marvi.Api.Features.Identity;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog.Media;

/// <summary>What an upload answers: the token to send with the product save, and the same-origin address that previews the stored photo.</summary>
public sealed record ProductPhotoUploadedDto(string PhotoToken, string PreviewUrl);

/// <summary>
/// Keeps MVC from reading the form before the action: the action reads it itself, inside the size limits, and answers a body that is too large
/// with its own 413 (otherwise [ApiController] turns the reader's failure into a generic 400 first).
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class ReadsItsOwnFormAttribute : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        var factories = context.ValueProviderFactories;
        factories.RemoveType<FormValueProviderFactory>();
        factories.RemoveType<FormFileValueProviderFactory>();
        factories.RemoveType<JQueryFormValueProviderFactory>();
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }
}

/// <summary>
/// The admin's product photo upload (MRV-9.7). One file per request, Admin only, rate limited and capped at 6 MB of request. The type is decided
/// by the file's own bytes (<see cref="ProductPhotoRules.Inspect"/>), never by its name or content type; the stored name is random. The upload
/// is not yet part of any product: the product save (create or edit) links it by token, in its own transaction.
/// </summary>
[ApiController]
[Route("api/admin/media/product-photos")]
[Authorize(Roles = "Admin")]
public class ProductPhotosController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly ProductPhotoStorage _storage;
    private readonly TimeProvider _clock;

    public ProductPhotosController(AppDbContext dbContext, ProductPhotoStorage storage, TimeProvider clock)
    {
        _dbContext = dbContext;
        _storage = storage;
        _clock = clock;
    }

    [HttpPost]
    [ReadsItsOwnForm]
    [EnableRateLimiting(RateLimiting.ProductPhotoPolicy)]
    [RequestSizeLimit(ProductPhotoRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = ProductPhotoRules.MaxRequestBytes, ValueCountLimit = 8)]
    public async Task<IActionResult> Upload(CancellationToken cancellationToken)
    {
        if (Request.ContentLength > ProductPhotoRules.MaxRequestBytes)
        {
            return TooLarge();
        }

        if (!Request.HasFormContentType)
        {
            return Refuse(ProductPhotoRules.ChooseMessage);
        }

        IFormCollection form;
        try
        {
            form = await Request.ReadFormAsync(cancellationToken);
        }
        catch (BadHttpRequestException exception) when (exception.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return TooLarge();
        }
        catch (InvalidDataException exception) when (exception.Message.Contains("limit", StringComparison.OrdinalIgnoreCase))
        {
            return TooLarge(); // the multipart reader's own cap, for a body that did not announce its length
        }
        catch (InvalidDataException)
        {
            return Refuse(ProductPhotoRules.CorruptMessage);
        }

        if (form.Files.Count != 1)
        {
            return Refuse(ProductPhotoRules.ChooseMessage);
        }

        var file = form.Files[0];
        if (file.Length > ProductPhotoRules.MaxFileBytes)
        {
            return Refuse(ProductPhotoRules.SizeMessage);
        }

        var adminId = User.UserId() ?? Guid.Empty;
        if (await _dbContext.ProductPhotoUploads.CountAsync(u => u.UploadedByUserId == adminId, cancellationToken) >= ProductPhotoRules.MaxPendingPerAdmin)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new[] { new ProductProblem(ProductPhotoRules.Field, ProductPhotoRules.TooManyPendingMessage) });
        }

        var bytes = new byte[file.Length];
        await using (var stream = file.OpenReadStream())
        {
            await stream.ReadExactlyAsync(bytes, cancellationToken);
        }

        var info = ProductPhotoRules.Inspect(bytes, out var message);
        if (info is null)
        {
            return Refuse(message);
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var fileName = $"{token}.{info.Extension}";
        await _storage.SaveAsync(fileName, bytes, cancellationToken);
        try
        {
            _dbContext.ProductPhotoUploads.Add(new ProductPhotoUpload
            {
                Token = token,
                FileName = fileName,
                UploadedByUserId = adminId,
                CreatedAt = _clock.GetUtcNow().UtcDateTime,
            });
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            _storage.Delete(fileName); // no row, no file: nothing could ever link it
            throw;
        }

        return Ok(new ProductPhotoUploadedDto(token, ProductPhotoRules.PublicPathOf(fileName)));
    }

    private BadRequestObjectResult Refuse(string message) => BadRequest(new[] { new ProductProblem(ProductPhotoRules.Field, message) });

    private ObjectResult TooLarge() =>
        StatusCode(StatusCodes.Status413PayloadTooLarge, new[] { new ProductProblem(ProductPhotoRules.Field, ProductPhotoRules.RequestTooLargeMessage) });
}

/// <summary>
/// Serves a stored product photo to anyone (MRV-9.7), read-only: <c>GET /api/public/media/products/{name}</c>. The name must be one this system
/// made (32 hex digits and jpg, png or webp), so nothing outside the media folder can be named; anything else is a 404. The response carries the
/// content type of the extension, <c>nosniff</c>, a locked-down CSP (the photo cannot run anything even if opened as a page) and a year of caching:
/// a name is random and never reused for different bytes.
/// </summary>
[ApiController]
[Route("api/public/media/products")]
public class ProductMediaController : ControllerBase
{
    private readonly ProductPhotoStorage _storage;

    public ProductMediaController(ProductPhotoStorage storage) => _storage = storage;

    [HttpGet("{name}")]
    public IActionResult Get(string name)
    {
        var path = _storage.Find(name);
        if (path is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
        return PhysicalFile(path, ProductPhotoRules.ContentTypeOf(name));
    }
}
