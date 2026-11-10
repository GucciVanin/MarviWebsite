using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Api.Features.Catalog.Media;
using Marvi.Domain.Catalog;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Tests.Catalog;

/// <summary>MRV-9.7: the product photo. Upload (what is accepted, what is refused), linking through the one product path, serving, cleanup.</summary>
public class ProductPhotoTests : IClassFixture<MarviApiFactory>
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private readonly MarviApiFactory _factory;

    public ProductPhotoTests(MarviApiFactory factory) => _factory = factory;

    private sealed record Problem(string Field, string Message);

    private static Task<HttpResponseMessage> UploadAsync(HttpClient client, byte[] bytes, string fileName = "foto.jpg", string contentType = "image/jpeg")
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "photo", fileName);
        return client.PostAsync("/api/admin/media/product-photos", form);
    }

    private static async Task<ProductPhotoUploadedDto> UploadOkAsync(HttpClient admin, byte[]? bytes = null)
    {
        var response = await UploadAsync(admin, bytes ?? ImageFixtures.Jpeg(400, 400));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ProductPhotoUploadedDto>(Web))!;
    }

    private string[] FilesOnDisk() => Directory.Exists(_factory.MediaPath) ? Directory.GetFiles(_factory.MediaPath).Select(Path.GetFileName).Order().ToArray()! : [];

    private async Task<ProductAdminDto> CreateWithPhotoAsync(HttpClient admin, string? token, string? sku = null)
    {
        var response = await admin.PostProductAsync(sku, photoToken: token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ProductAdminDto>(Web))!;
    }

    private async Task<T> InDbAsync<T>(Func<AppDbContext, Task<T>> work)
    {
        using var scope = _factory.Services.CreateScope();
        return await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    // ---- AC-1: the upload

    [Theory]
    [InlineData("jpg", "image/jpeg")]
    [InlineData("png", "image/png")]
    [InlineData("webp", "image/webp")]
    public async Task AValidPhoto_IsStoredUnderARandomName_AndAnsweredWithATokenAndAPreviewUrl(string extension, string contentType)
    {
        var admin = await _factory.AdminAsync();
        var bytes = extension switch
        {
            "jpg" => ImageFixtures.Jpeg(400, 400),
            "png" => ImageFixtures.Png(400, 400),
            _ => ImageFixtures.Webp(640, 480, ImageFixtures.WebpKind.Lossless),
        };

        var response = await UploadAsync(admin, bytes, "Minha Foto Original.JPG", "application/octet-stream");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var uploaded = (await response.Content.ReadFromJsonAsync<ProductPhotoUploadedDto>(Web))!;
        Assert.Matches("^[0-9a-f]{32}$", uploaded.PhotoToken);
        Assert.Equal($"/api/public/media/products/{uploaded.PhotoToken}.{extension}", uploaded.PreviewUrl);
        Assert.DoesNotContain("Minha", uploaded.PreviewUrl); // never the original name
        Assert.Equal(bytes, await File.ReadAllBytesAsync(Path.Combine(_factory.MediaPath, $"{uploaded.PhotoToken}.{extension}")));

        var served = await _factory.CreateClient().GetAsync(uploaded.PreviewUrl);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal(contentType, served.Content.Headers.ContentType!.MediaType);
        Assert.Equal(bytes, await served.Content.ReadAsByteArrayAsync());
    }

    [Theory]
    [InlineData(ImageFixtures.WebpKind.Lossy)]
    [InlineData(ImageFixtures.WebpKind.Extended)]
    public async Task TheOtherWebpLayouts_AreAccepted(ImageFixtures.WebpKind kind)
    {
        var admin = await _factory.AdminAsync();

        var response = await UploadAsync(admin, ImageFixtures.Webp(800, 600, kind), "a.webp", "image/webp");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task TheKindComesFromTheBytes_NotFromTheNameOrTheContentType()
    {
        var admin = await _factory.AdminAsync();

        // A PNG called .exe with a text/html content type is a PNG ...
        var png = await UploadAsync(admin, ImageFixtures.Png(400, 400), "virus.exe", "text/html");
        Assert.Equal(HttpStatusCode.OK, png.StatusCode);
        Assert.EndsWith(".png", (await png.Content.ReadFromJsonAsync<ProductPhotoUploadedDto>(Web))!.PreviewUrl);

        // ... and a script called .jpg with an image content type is refused.
        var script = await UploadAsync(admin, Encoding.UTF8.GetBytes("alert(1);"), "foto.jpg", "image/jpeg");
        Assert.Equal(HttpStatusCode.BadRequest, script.StatusCode);
    }

    public static TheoryData<string> Refused() => new()
    {
        "script in a JPEG comment", "zip appended to a JPEG", "JPEG without its end marker", "PNG with data after IEND", "PNG with a bad checksum",
        "WebP with a wrong RIFF size", "animated WebP", "SVG", "GIF", "HEIC", "PDF", "HTML named jpg", "zip", "executable", "empty", "truncated PNG",
        "JPEG lossless frame",
    };

    private static byte[] Sample(string name) => name switch
    {
        "script in a JPEG comment" => ImageFixtures.Jpeg(400, 400, comment: "<script>alert(1)</script>"),
        "zip appended to a JPEG" => ImageFixtures.Jpeg(400, 400, trailing: ImageFixtures.Zip()),
        "JPEG without its end marker" => ImageFixtures.Jpeg(400, 400, omitEnd: true),
        "PNG with data after IEND" => ImageFixtures.Png(400, 400, trailing: ImageFixtures.Zip()),
        "PNG with a bad checksum" => ImageFixtures.Png(400, 400, breakCrc: true),
        "WebP with a wrong RIFF size" => ImageFixtures.Webp(400, 400, sizeDelta: 4),
        "animated WebP" => ImageFixtures.Webp(400, 400, ImageFixtures.WebpKind.Extended, animated: true),
        "SVG" => ImageFixtures.Svg(),
        "GIF" => ImageFixtures.Gif(),
        "HEIC" => ImageFixtures.Heic(),
        "PDF" => ImageFixtures.Pdf(),
        "HTML named jpg" => ImageFixtures.Html(),
        "zip" => ImageFixtures.Zip(),
        "executable" => ImageFixtures.Exe(),
        "empty" => [],
        "truncated PNG" => ImageFixtures.Png(400, 400)[..60],
        "JPEG lossless frame" => PatchFrameMarker(ImageFixtures.Jpeg(400, 400)),
        _ => throw new ArgumentException(name),
    };

    private static byte[] PatchFrameMarker(byte[] jpeg)
    {
        var at = Array.IndexOf(jpeg, (byte)0xC0, 20);
        var copy = (byte[])jpeg.Clone();
        copy[at] = 0xC3; // SOF3: lossless
        return copy;
    }

    [Theory]
    [MemberData(nameof(Refused))]
    public async Task AnythingElse_IsRefused_InPortuguese_WithoutEchoingTheFile_AndStoresNothing(string name)
    {
        var admin = await _factory.AdminAsync();
        var before = FilesOnDisk();
        var rows = await InDbAsync(db => db.ProductPhotoUploads.CountAsync());

        var response = await UploadAsync(admin, Sample(name), "SEGREDO-NOME.jpg", "image/jpeg");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        var problem = JsonSerializer.Deserialize<List<Problem>>(text, Web)!.Single();
        Assert.Equal("photo", problem.Field);
        Assert.Matches("(foto|imagem|JPEG|MB|Escolha)", problem.Message);
        Assert.DoesNotContain("SEGREDO", text);
        Assert.Equal(before, FilesOnDisk());
        Assert.Equal(rows, await InDbAsync(db => db.ProductPhotoUploads.CountAsync()));
    }

    [Fact]
    public void ThePolyglotScan_RefusesMarkupAnywhereInTheFile()
    {
        // A PNG whose structure is perfect but whose IDAT-adjacent text chunk spells a script tag is refused too.
        var png = ImageFixtures.Png(400, 400);
        var marker = Encoding.ASCII.GetBytes("<ScRiPt>");
        var polyglot = png.Take(33).Concat(TextChunk(marker)).Concat(png.Skip(33)).ToArray();

        Assert.Null(ProductPhotoRules.Inspect(polyglot, out var message));
        Assert.Equal(ProductPhotoRules.CorruptMessage, message);
        Assert.NotNull(ProductPhotoRules.Inspect(png, out _)); // and the same PNG without the text is fine
    }

    private static byte[] TextChunk(byte[] text)
    {
        var body = Encoding.ASCII.GetBytes("Comment\0").Concat(text).ToArray();
        var type = Encoding.ASCII.GetBytes("tEXt");
        var chunk = new List<byte>();
        chunk.AddRange(new byte[] { 0, 0, (byte)(body.Length >> 8), (byte)body.Length });
        chunk.AddRange(type);
        chunk.AddRange(body);
        var crc = ProductPhotoRules.Crc32(type, body);
        chunk.AddRange(new[] { (byte)(crc >> 24), (byte)(crc >> 16), (byte)(crc >> 8), (byte)crc });
        return chunk.ToArray();
    }

    [Theory]
    [InlineData(399, 400, false)]
    [InlineData(400, 399, false)]
    [InlineData(100, 100, false)]
    [InlineData(400, 400, true)]
    [InlineData(6000, 6000, true)]
    [InlineData(6001, 400, false)]
    [InlineData(400, 6001, false)]
    [InlineData(65000, 400, false)]
    [InlineData(400, 65000, false)]
    public async Task TheDimensionsMustBeBetween400And6000_OnBothSides(int width, int height, bool accepted)
    {
        var admin = await _factory.AdminAsync();

        var jpeg = await UploadAsync(admin, ImageFixtures.Jpeg(width, height));
        var png = await UploadAsync(admin, ImageFixtures.Png(width, height, realData: false), "a.png", "image/png");

        Assert.Equal(accepted ? HttpStatusCode.OK : HttpStatusCode.BadRequest, jpeg.StatusCode);
        Assert.Equal(accepted ? HttpStatusCode.OK : HttpStatusCode.BadRequest, png.StatusCode);
        if (!accepted)
        {
            var message = JsonSerializer.Deserialize<List<Problem>>(await jpeg.Content.ReadAsStringAsync(), Web)!.Single().Message;
            Assert.Contains("pixels", message);
        }
    }

    [Fact]
    public async Task AFileOverFiveMegabytes_IsRefused_AndARequestOverSixMegabytesIsRefusedBeforeItIsRead()
    {
        var admin = await _factory.AdminAsync();

        var big = await UploadAsync(admin, ImageFixtures.Jpeg(400, 400, paddingBytes: 5 * 1024 * 1024 + 1));
        Assert.Equal(HttpStatusCode.BadRequest, big.StatusCode);
        Assert.Equal(ProductPhotoRules.SizeMessage, JsonSerializer.Deserialize<List<Problem>>(await big.Content.ReadAsStringAsync(), Web)!.Single().Message);

        var atTheLimit = ImageFixtures.Jpeg(400, 400, paddingBytes: 5 * 1024 * 1024 - 2000);
        Assert.True(atTheLimit.Length <= ProductPhotoRules.MaxFileBytes);
        Assert.Equal(HttpStatusCode.OK, (await UploadAsync(admin, atTheLimit)).StatusCode);

        var huge = await UploadAsync(admin, new byte[7 * 1024 * 1024]);
        Assert.True(huge.StatusCode == HttpStatusCode.RequestEntityTooLarge, $"{huge.StatusCode}: {await huge.Content.ReadAsStringAsync()}");
        Assert.Equal("photo", JsonSerializer.Deserialize<List<Problem>>(await huge.Content.ReadAsStringAsync(), Web)!.Single().Field);
    }

    [Fact]
    public async Task ARequestWithNoFile_ManyFiles_OrNotMultipart_IsRefused()
    {
        var admin = await _factory.AdminAsync();

        var none = await admin.PostAsync("/api/admin/media/product-photos", new MultipartFormDataContent { { new StringContent("x"), "note" } });
        var json = await admin.PostAsJsonAsync("/api/admin/media/product-photos", new { photo = "x" });
        var two = new MultipartFormDataContent();
        two.Add(new ByteArrayContent(ImageFixtures.Png(400, 400)), "a", "a.png");
        two.Add(new ByteArrayContent(ImageFixtures.Png(400, 400)), "b", "b.png");
        var many = await admin.PostAsync("/api/admin/media/product-photos", two);

        Assert.Equal(HttpStatusCode.BadRequest, none.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, json.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, many.StatusCode);
    }

    [Fact]
    public async Task OnlyAnAdmin_CanUpload()
    {
        var visitor = _factory.CreateClient();
        var (client, _) = await _factory.RegisterClientAsync();
        var admin = await _factory.AdminAsync();
        var email = $"{Guid.NewGuid()}@example.com";
        (await admin.PostAsJsonAsync("/api/admin/employees",
            new Marvi.Api.Features.Identity.Contracts.CreateEmployeeRequest(email, "Test1234!", $"E-{Guid.NewGuid():N}"[..20], "Sales", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)))).EnsureSuccessStatusCode();
        var employee = await _factory.LoginAsync(email, "Test1234!");

        Assert.Equal(HttpStatusCode.Unauthorized, (await UploadAsync(visitor, ImageFixtures.Png(400, 400))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await UploadAsync(client, ImageFixtures.Png(400, 400))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await UploadAsync(employee, ImageFixtures.Png(400, 400))).StatusCode);
    }

    [Fact]
    public async Task TooManyWaitingUploads_AreRefusedWith429()
    {
        var admin = await _factory.AdminAsync();
        var adminId = await InDbAsync(async db => (await db.Users.FirstAsync(u => u.Email == MarviApiFactory.AdminEmail)).Id);
        await InDbAsync(async db =>
        {
            for (var i = 0; i < ProductPhotoRules.MaxPendingPerAdmin; i++)
            {
                var token = Guid.NewGuid().ToString("N");
                db.ProductPhotoUploads.Add(new ProductPhotoUpload { Token = token, FileName = token + ".png", UploadedByUserId = adminId, CreatedAt = DateTime.UtcNow });
            }

            await db.SaveChangesAsync();
            return 0;
        });

        var response = await UploadAsync(admin, ImageFixtures.Png(400, 400));

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal(ProductPhotoRules.TooManyPendingMessage, JsonSerializer.Deserialize<List<Problem>>(await response.Content.ReadAsStringAsync(), Web)!.Single().Message);
        await InDbAsync(async db => { db.ProductPhotoUploads.RemoveRange(db.ProductPhotoUploads); await db.SaveChangesAsync(); return 0; });
    }

    // ---- AC-3: serving

    [Fact]
    public async Task APhoto_IsServedToAnyone_WithTheContentTypeNosniffAndALongCache()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin, ImageFixtures.Png(400, 400));

        var response = await _factory.CreateClient().GetAsync(uploaded.PreviewUrl);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("public, max-age=31536000, immutable", response.Headers.CacheControl!.ToString());
        Assert.Contains("default-src 'none'", response.Headers.GetValues("Content-Security-Policy").Single());
    }

    public static TheoryData<string> Traversal() => new()
    {
        "..", "../appsettings.json", "..%2Fappsettings.json", "%2e%2e%2fappsettings.json", "..%5Cappsettings.json", "..\\appsettings.json",
        "%2Fetc%2Fpasswd", "/etc/passwd", "C:%5Cwindows%5Cwin.ini", "....//....//x", 
        "0123456789abcdef0123456789abcdef.png/..", "0123456789abcdef0123456789abcdef", "0123456789ABCDEF0123456789ABCDEF.png",
        "0123456789abcdef0123456789abcdef.gif", "0123456789abcdef0123456789abcdef.svg", "0123456789abcdef0123456789abcdef.png.exe",
        "0123456789abcdef0123456789abcde.png", ".hidden", "CON", "%252e%252e%252fappsettings.json",
    };

    [Theory]
    [MemberData(nameof(Traversal))]
    public async Task ApathThatIsNotAStoredPhotoName_Answers404(string name)
    {
        var response = await _factory.CreateClient().GetAsync("/api/public/media/products/" + name);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AFileDroppedInTheMediaFolderWithAnUnknownName_IsNeverServed()
    {
        var stray = Path.Combine(_factory.MediaPath, "secret.txt");
        await File.WriteAllTextAsync(stray, "do not serve");

        Assert.Equal(HttpStatusCode.NotFound, (await _factory.CreateClient().GetAsync("/api/public/media/products/secret.txt")).StatusCode);
        File.Delete(stray);
    }

    // ---- AC-2: linking through the one product path

    [Fact]
    public async Task CreatingAProductWithAToken_LinksThePhoto_AndSpendsTheToken()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);

        var product = await CreateWithPhotoAsync(admin, uploaded.PhotoToken);

        Assert.Equal(uploaded.PreviewUrl, product.ImageUrl);
        Assert.Equal(uploaded.PreviewUrl, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);
        Assert.False(await InDbAsync(db => db.ProductPhotoUploads.AnyAsync(u => u.Token == uploaded.PhotoToken)));
        Assert.Equal(HttpStatusCode.OK, (await _factory.CreateClient().GetAsync(uploaded.PreviewUrl)).StatusCode);

        var again = await admin.PostProductAsync(photoToken: uploaded.PhotoToken); // a token works once
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        var problem = JsonSerializer.Deserialize<List<Problem>>(await again.Content.ReadAsStringAsync(), Web)!.Single();
        Assert.Equal("photo", problem.Field);
        Assert.Equal(ProductPhotoRules.TokenMessage, problem.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-token")]
    [InlineData("0123456789abcdef0123456789abcdef")]
    [InlineData("0123456789ABCDEF0123456789ABCDEF")]
    [InlineData("../../etc/passwd")]
    public async Task AnUnknownOrMalformedToken_Is400_OnFieldPhoto_AndTheProductIsNotCreated(string token)
    {
        var admin = await _factory.AdminAsync();
        var sku = $"TOK-{Guid.NewGuid():N}"[..20];

        var response = await admin.PostProductAsync(sku, photoToken: token);

        if (token.Length == 0)
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode); // an empty token means "no photo"
            return;
        }

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains(JsonSerializer.Deserialize<List<Problem>>(text, Web)!, p => p.Field == "photo");
        Assert.DoesNotContain(token, text);
        Assert.DoesNotContain((await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products", Web))!, p => p.Sku == sku);
    }

    [Fact]
    public async Task AnotherAdminsToken_AnAgedToken_AndAMissingFile_AreRefused()
    {
        var admin = await _factory.AdminAsync();

        // Another admin's: the row belongs to a different user id.
        var foreign = Guid.NewGuid().ToString("N");
        await File.WriteAllBytesAsync(Path.Combine(_factory.MediaPath, foreign + ".png"), ImageFixtures.Png(400, 400));
        await InDbAsync(async db => { db.ProductPhotoUploads.Add(new ProductPhotoUpload { Token = foreign, FileName = foreign + ".png", UploadedByUserId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow }); await db.SaveChangesAsync(); return 0; });
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostProductAsync(photoToken: foreign)).StatusCode);

        // Expired: an hour and a minute later.
        var aged = await UploadOkAsync(admin);
        _factory.Clock.Advance(TimeSpan.FromMinutes(75)); // past the hour and the cleanup's own grace
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostProductAsync(photoToken: aged.PhotoToken)).StatusCode);

        // The file vanished (a restore, a manual delete): the token is useless rather than a broken link.
        var lost = await UploadOkAsync(admin);
        File.Delete(Path.Combine(_factory.MediaPath, Path.GetFileName(lost.PreviewUrl)));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostProductAsync(photoToken: lost.PhotoToken)).StatusCode);
    }

    [Fact]
    public void ARealPhotoWhosePixelDataSpellsAMarker_IsNotRefused_OnlyMetadataIsSearched()
    {
        // PNG: a stored (uncompressed) deflate block in IDAT carrying "<svg <script": the chunk is rebuilt with a valid CRC.
        var marker = Encoding.ASCII.GetBytes("<svg <script");
        var idatData = new byte[] { 0x78, 0x01, 0x01, (byte)marker.Length, 0, (byte)~marker.Length, 0xFF }.Concat(marker).Concat(new byte[] { 0, 0, 0, 0 }).ToArray();
        var type = Encoding.ASCII.GetBytes("IDAT");
        var crc = ProductPhotoRules.Crc32(type, idatData);
        var chunk = new List<byte>();
        chunk.AddRange(new byte[] { 0, 0, (byte)(idatData.Length >> 8), (byte)idatData.Length });
        chunk.AddRange(type);
        chunk.AddRange(idatData);
        chunk.AddRange(new[] { (byte)(crc >> 24), (byte)(crc >> 16), (byte)(crc >> 8), (byte)crc });
        var png = ImageFixtures.Png(400, 400);
        var iend = png.Length - 12;
        var withMarker = png.Take(iend).Concat(chunk).Concat(png.Skip(iend)).ToArray();
        Assert.NotNull(ProductPhotoRules.Inspect(withMarker, out var pngMessage));
        Assert.Equal(string.Empty, pngMessage);

        // JPEG: the same text inside the entropy-coded data.
        var marked = ImageFixtures.Jpeg(400, 400).ToArray();
        marker.CopyTo(marked, marked.Length - 40);
        Assert.NotNull(ProductPhotoRules.Inspect(marked, out var jpegMessage));
        Assert.Equal(string.Empty, jpegMessage);

        // The same text in a metadata segment is still refused.
        Assert.Null(ProductPhotoRules.Inspect(ImageFixtures.Jpeg(400, 400, comment: "<svg"), out _));
    }

    [Fact]
    public async Task EditingWithANewToken_ReplacesThePhoto_AndDeletesThePreviousFile()
    {
        var admin = await _factory.AdminAsync();
        var first = await UploadOkAsync(admin);
        var product = await CreateWithPhotoAsync(admin, first.PhotoToken);
        var second = await UploadOkAsync(admin, ImageFixtures.Png(500, 500));

        var response = await admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, photoToken: second.PhotoToken));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(second.PreviewUrl, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);
        Assert.False(File.Exists(Path.Combine(_factory.MediaPath, Path.GetFileName(first.PreviewUrl))));
        Assert.Equal(HttpStatusCode.NotFound, (await _factory.CreateClient().GetAsync(first.PreviewUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _factory.CreateClient().GetAsync(second.PreviewUrl)).StatusCode);
        Assert.False(await InDbAsync(db => db.ProductPhotoUploads.AnyAsync(u => u.Token == second.PhotoToken)));
    }

    [Fact]
    public async Task RemovePhoto_ClearsIt_AndDeletesTheFile_AndAnEditWithoutEitherKeepsIt()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);
        var product = await CreateWithPhotoAsync(admin, uploaded.PhotoToken);

        var kept = await admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, name: "Outro nome"));
        Assert.Equal(HttpStatusCode.NoContent, kept.StatusCode);
        Assert.Equal(uploaded.PreviewUrl, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);

        var deactivated = await admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, name: "Outro nome", isActive: false)); // the IsActive-only exception
        Assert.Equal(HttpStatusCode.NoContent, deactivated.StatusCode);
        Assert.Equal(uploaded.PreviewUrl, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);

        var removed = await admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, name: "Outro nome", isActive: false, removePhoto: true));
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        Assert.Null((await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);
        Assert.False(File.Exists(Path.Combine(_factory.MediaPath, Path.GetFileName(uploaded.PreviewUrl))));
    }

    [Fact]
    public async Task RemovePhotoAlone_OnAnUnchangedProduct_IsAnEditLikeAnyOther_AndABothRequestIsRefused()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);
        var product = await CreateWithPhotoAsync(admin, uploaded.PhotoToken);
        var another = await UploadOkAsync(admin);

        var both = await admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, photoToken: another.PhotoToken, removePhoto: true));

        Assert.Equal(HttpStatusCode.BadRequest, both.StatusCode);
        Assert.Equal("photo", JsonSerializer.Deserialize<List<Problem>>(await both.Content.ReadAsStringAsync(), Web)!.Single().Field);
        Assert.Equal(uploaded.PreviewUrl, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);
        Assert.True(await InDbAsync(db => db.ProductPhotoUploads.AnyAsync(u => u.Token == another.PhotoToken))); // the refused edit did not spend the token

        var removeOnly = await admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, removePhoto: true));
        Assert.Equal(HttpStatusCode.NoContent, removeOnly.StatusCode);
        Assert.Null((await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);
    }

    [Fact]
    public async Task AnEditThatTheRulesRefuse_DoesNotSpendTheToken_OrTouchThePhoto()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);
        var product = await CreateWithPhotoAsync(admin, uploaded.PhotoToken);
        var next = await UploadOkAsync(admin);

        var response = await admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, name: "x", photoToken: next.PhotoToken));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(uploaded.PreviewUrl, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);
        Assert.True(File.Exists(Path.Combine(_factory.MediaPath, Path.GetFileName(uploaded.PreviewUrl))));
        Assert.True(await InDbAsync(db => db.ProductPhotoUploads.AnyAsync(u => u.Token == next.PhotoToken)));
    }

    [Fact]
    public async Task DeletingAProduct_DeletesItsPhotoFile()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);
        var product = await CreateWithPhotoAsync(admin, uploaded.PhotoToken);

        (await admin.DeleteAsync($"/api/admin/products/{product.Id}")).EnsureSuccessStatusCode();

        Assert.False(File.Exists(Path.Combine(_factory.MediaPath, Path.GetFileName(uploaded.PreviewUrl))));
    }

    [Fact]
    public async Task TheOldImageAddressField_IsGone_FromCreateAndEdit()
    {
        var admin = await _factory.AdminAsync();
        var category = await admin.EnsureTestCategoryAsync();
        var sku = $"OLDIMG-{Guid.NewGuid():N}"[..20];

        var created = await admin.PostAsJsonAsync("/api/admin/products/with-setup",
            new { sku, name = "Com endereco", categoryId = category, imageUrl = "https://exemplo.com/a.png", isActive = true, attributes = new Dictionary<string, string>(), prices = Array.Empty<object>(), stock = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Null((await created.Content.ReadFromJsonAsync<ProductAdminDto>(Web))!.ImageUrl);
    }

    [Fact]
    public async Task ThePublicCatalog_AndTheQuoteAndOrderLines_CarryThePhotoPath()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);
        var productId = (await (await admin.PostProductAsync(description: "Descrição visível", photoToken: uploaded.PhotoToken, attributes: new() { ["Marca"] = "Cola" })).Content.ReadFromJsonAsync<ProductAdminDto>(Web))!.Id;
        var (client, accountId) = await _factory.RegisterClientAsync(); // registering creates the default tier
        var tiers = (await admin.GetFromJsonAsync<List<PricingTierDto>>("/api/admin/pricing-tiers", Web))!;
        (await admin.PutAsJsonAsync($"/api/admin/products/{productId}/pricing", new UpsertProductPricingRequest(tiers.Single(t => t.IsDefault).Id, 5m, 1))).EnsureSuccessStatusCode();

        var listed = (await _factory.CreateClient().GetFromJsonAsync<List<ProductListItemDto>>("/api/products", Web))!;
        var quote = await client.PostAsJsonAsync("/api/quotes", new Marvi.Api.Features.Quotes.Contracts.CreateQuoteRequest([new Marvi.Api.Features.Quotes.Contracts.QuoteLineItemRequest(productId, 2)]));
        var order = await admin.PostAsJsonAsync("/api/employee/orders", new Marvi.Api.Features.Orders.Contracts.CreateEmployeeOrderRequest(accountId, null, [new Marvi.Api.Features.Orders.Contracts.EmployeeOrderLineItemRequest(productId, 1)]));

        Assert.Equal(uploaded.PreviewUrl, listed.Single(p => p.Id == productId).ImageUrl);
        Assert.Equal("Descrição visível", listed.Single(p => p.Id == productId).Description); // the cards show what the admin typed (AC-6)
        Assert.Equal("Cola", listed.Single(p => p.Id == productId).Attributes["Marca"]);
        Assert.Equal(HttpStatusCode.Created, quote.StatusCode);
        Assert.Equal(uploaded.PreviewUrl, (await quote.Content.ReadFromJsonAsync<Marvi.Api.Features.Quotes.Contracts.QuoteDto>(Web))!.LineItems.Single().ImageUrl);
        Assert.Equal(HttpStatusCode.Created, order.StatusCode);
        Assert.Equal(uploaded.PreviewUrl, (await order.Content.ReadFromJsonAsync<Marvi.Api.Features.Orders.Contracts.OrderDto>(Web))!.LineItems.Single().ImageUrl);
    }

    private static object Edit(ProductAdminDto product, string? name = null, bool? isActive = null, string? photoToken = null, bool removePhoto = false) => new
    {
        sku = product.Sku, name = name ?? product.Name, description = product.Description, categoryId = product.CategoryId,
        isActive = isActive ?? product.IsActive, attributes = product.Attributes, photoToken, removePhoto,
    };

    // ---- AC-2: cleanup

    [Fact]
    public async Task TheCleanup_RemovesUploadsOlderThanAnHour_AndFilesNothingRefersTo_ButKeepsEverythingElse()
    {
        using var factory = new MarviApiFactory();
        var admin = await factory.AdminAsync();
        var linked = await UploadOkAsync(admin);
        (await admin.PostProductAsync(photoToken: linked.PhotoToken)).EnsureSuccessStatusCode();
        var waiting = await UploadOkAsync(admin);
        var orphan = Path.Combine(factory.MediaPath, new string('a', 32) + ".png");
        await File.WriteAllBytesAsync(orphan, ImageFixtures.Png(400, 400));
        File.SetLastWriteTimeUtc(orphan, DateTime.UtcNow.AddHours(-3));
        var staleTemp = Path.Combine(factory.MediaPath, ".0123456789abcdef0123456789abcdef.tmp"); // a crash while writing
        await File.WriteAllBytesAsync(staleTemp, [1, 2, 3]);
        File.SetLastWriteTimeUtc(staleTemp, DateTime.UtcNow.AddHours(-3));
        var freshOrphan = Path.Combine(factory.MediaPath, new string('b', 32) + ".png"); // written a moment ago: could be an upload in flight
        await File.WriteAllBytesAsync(freshOrphan, ImageFixtures.Png(400, 400));

        async Task<int> RunAsync()
        {
            using var scope = factory.Services.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<ProductPhotoService>().CleanupAsync();
        }

        Assert.Equal(2, await RunAsync()); // the old orphan and the old half-written file
        Assert.False(File.Exists(orphan));
        Assert.False(File.Exists(staleTemp));
        Assert.True(File.Exists(freshOrphan));
        Assert.True(File.Exists(Path.Combine(factory.MediaPath, Path.GetFileName(waiting.PreviewUrl))));

        factory.Clock.Advance(TimeSpan.FromMinutes(65)); // past the hour (the token is dead) but inside the cleanup's grace
        Assert.Equal(0, await RunAsync());
        Assert.True(File.Exists(Path.Combine(factory.MediaPath, Path.GetFileName(waiting.PreviewUrl))));
        factory.Clock.Advance(TimeSpan.FromMinutes(10));
        Assert.Equal(2, await RunAsync()); // the waiting upload (row and file) and the now-old orphan; the linked photo stays
        Assert.False(File.Exists(Path.Combine(factory.MediaPath, Path.GetFileName(waiting.PreviewUrl))));
        Assert.False(File.Exists(freshOrphan));
        Assert.True(File.Exists(Path.Combine(factory.MediaPath, Path.GetFileName(linked.PreviewUrl))));
        using var scope = factory.Services.CreateScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<AppDbContext>().ProductPhotoUploads.ToListAsync());
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().GetAsync(linked.PreviewUrl)).StatusCode);
    }

    // ---- AC-9: the link is rolled back with the product

    [Fact]
    public async Task WhenTheProductSaveFails_NothingIsLinked_AndTheTokenStillWorksAfterwards()
    {
        using var factory = new FailingAuditFactory();
        var admin = await factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);
        var sku = $"RB-{Guid.NewGuid():N}"[..20];
        factory.FailAuditWrites = true;

        var failure = await Record.ExceptionAsync(async () =>
        {
            var response = await admin.PostProductAsync(sku, photoToken: uploaded.PhotoToken);
            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        });
        factory.FailAuditWrites = false;

        Assert.True(failure is null || failure is InvalidOperationException);
        Assert.DoesNotContain((await admin.GetFromJsonAsync<List<ProductAdminDto>>("/api/admin/products", Web))!, p => p.Sku == sku);
        using (var scope = factory.Services.CreateScope())
        {
            Assert.True(await scope.ServiceProvider.GetRequiredService<AppDbContext>().ProductPhotoUploads.AnyAsync(u => u.Token == uploaded.PhotoToken)); // the token was not spent
        }

        Assert.True(File.Exists(Path.Combine(factory.MediaPath, Path.GetFileName(uploaded.PreviewUrl)))); // and the file is still there
        var retry = await admin.PostProductAsync(sku, photoToken: uploaded.PhotoToken);
        Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
    }

    [Fact]
    public async Task AFailedEdit_KeepsThePreviousPhoto_AndItsFile()
    {
        using var factory = new FailingAuditFactory();
        var admin = await factory.AdminAsync();
        var first = await UploadOkAsync(admin);
        var product = (await (await admin.PostProductAsync(photoToken: first.PhotoToken)).Content.ReadFromJsonAsync<ProductAdminDto>(Web))!;
        var second = await UploadOkAsync(admin);
        factory.FailAuditWrites = true;

        await Record.ExceptionAsync(() => admin.PutAsJsonAsync($"/api/admin/products/{product.Id}", Edit(product, photoToken: second.PhotoToken)));
        factory.FailAuditWrites = false;

        Assert.Equal(first.PreviewUrl, (await admin.GetFromJsonAsync<ProductAdminDto>($"/api/admin/products/{product.Id}", Web))!.ImageUrl);
        Assert.True(File.Exists(Path.Combine(factory.MediaPath, Path.GetFileName(first.PreviewUrl))));
        Assert.True(File.Exists(Path.Combine(factory.MediaPath, Path.GetFileName(second.PreviewUrl))));
    }

    // ---- the data check no longer reads an image address

    [Fact]
    public async Task TheDataCheck_NeverComplainsAboutAPhotoPath()
    {
        var admin = await _factory.AdminAsync();
        var uploaded = await UploadOkAsync(admin);
        var product = await CreateWithPhotoAsync(admin, uploaded.PhotoToken);

        var check = (await admin.GetFromJsonAsync<ProductDataCheckDto>("/api/admin/products/data-check", Web))!;

        Assert.DoesNotContain(check.Products, p => p.Id == product.Id);
    }
}

/// <summary>MRV-9.7: the upload has its own rate limit policy (30 a minute by default; 3 here).</summary>
public class ProductPhotoRateLimitTests : IClassFixture<ProductPhotoRateLimitTests.PhotoLimitFactory>
{
    private readonly PhotoLimitFactory _factory;

    public ProductPhotoRateLimitTests(PhotoLimitFactory factory) => _factory = factory;

    [Fact]
    public async Task TheUpload_IsLimitedPerClient_With429AndRetryAfter()
    {
        var admin = await _factory.AdminAsync();
        HttpStatusCode last = default;
        HttpResponseMessage? limited = null;
        for (var i = 0; i < 5; i++)
        {
            var form = new MultipartFormDataContent { { new ByteArrayContent(ImageFixtures.Png(400, 400)), "photo", "a.png" } };
            var response = await admin.PostAsync("/api/admin/media/product-photos", form);
            last = response.StatusCode;
            if (last == HttpStatusCode.TooManyRequests)
            {
                limited = response;
                break;
            }
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last);
        Assert.True(limited!.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    public sealed class PhotoLimitFactory : MarviApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimiting:ProductPhoto:PermitLimit"] = "3",
            }));
        }
    }
}
