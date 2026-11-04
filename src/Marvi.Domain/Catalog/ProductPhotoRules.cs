using System.Buffers.Binary;
using System.Text;
using System.Text.RegularExpressions;

namespace Marvi.Domain.Catalog;

/// <summary>What an accepted photo is: its kind (decided by its bytes, never by the name or the client's content type) and its size in pixels.</summary>
public sealed record ProductPhotoInfo(string Extension, string ContentType, int Width, int Height);

/// <summary>
/// The product photo rules (MRV-9.7): which files are accepted and how a stored name looks. A file is accepted only when its leading bytes
/// are a JPEG, PNG or WebP signature AND the whole file parses as that format (segments, chunks and checksums add up, nothing trails the end
/// marker), so an image that is also a script, an archive or an SVG is refused. Messages are pt-BR, name the field <c>photo</c> and never
/// repeat the file name or any content. The photo is not resized or stripped here: metadata (EXIF, GPS) stays in the file (logged as a follow-up).
/// </summary>
public static partial class ProductPhotoRules
{
    public const int MaxFileBytes = 5 * 1024 * 1024;
    /// <summary>The largest request the upload accepts: the file plus the multipart framing. nginx allows the same 6 MB for this one location.</summary>
    public const int MaxRequestBytes = 6 * 1024 * 1024;
    public const int MinSide = 400;
    public const int MaxSide = 6000;
    /// <summary>At most this many uploads wait, unlinked, per admin (they are removed after <see cref="PendingLifetime"/>).</summary>
    public const int MaxPendingPerAdmin = 50;
    public static readonly TimeSpan PendingLifetime = TimeSpan.FromHours(1);
    public const string PublicPrefix = "/api/public/media/products/";
    public const string Field = "photo";

    public const string ChooseMessage = "Escolha uma foto do produto.";
    public const string TypeMessage = "Use uma foto JPEG, PNG ou WebP.";
    public const string CorruptMessage = "O arquivo não é uma imagem válida. Escolha outra foto.";
    public const string SizeMessage = "A foto deve ter no máximo 5 MB.";
    public const string TooSmallMessage = "A foto deve ter pelo menos 400 x 400 pixels.";
    public const string TooBigMessage = "A foto deve ter no máximo 6000 x 6000 pixels.";
    public const string TokenMessage = "A foto enviada expirou, já foi usada ou não é sua. Envie a foto de novo.";
    public const string BothMessage = "Escolha uma nova foto ou remova a atual, não as duas coisas.";
    public const string TooManyPendingMessage = "Há fotos demais aguardando. Salve o produto ou tente de novo em uma hora.";
    public const string RequestTooLargeMessage = "O envio é grande demais. A foto deve ter no máximo 5 MB.";

    [GeneratedRegex("^[0-9a-f]{32}$")]
    private static partial Regex TokenShape();

    [GeneratedRegex("^[0-9a-f]{32}\\.(jpg|png|webp)$")]
    private static partial Regex FileNameShape();

    public static bool IsToken(string? value) => value is not null && TokenShape().IsMatch(value);

    /// <summary>True only for a stored name this system could have made: 32 lower-case hex digits and one of the three extensions. Nothing else ever reaches the disk.</summary>
    public static bool IsStoredName(string? value) => value is not null && FileNameShape().IsMatch(value);

    public static string PublicPathOf(string fileName) => PublicPrefix + fileName;

    /// <summary>The stored name inside a public path (<c>/api/public/media/products/{name}</c>), or null when the value is not one of ours.</summary>
    public static string? FileNameOf(string? publicPath)
    {
        if (publicPath is null || !publicPath.StartsWith(PublicPrefix, StringComparison.Ordinal))
        {
            return null;
        }

        var name = publicPath[PublicPrefix.Length..];
        return IsStoredName(name) ? name : null;
    }

    public static string ContentTypeOf(string fileName) => Path.GetExtension(fileName) switch
    {
        ".jpg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => "application/octet-stream",
    };

    /// <summary>The accepted photo, or null with the pt-BR message in <paramref name="message"/>.</summary>
    public static ProductPhotoInfo? Inspect(ReadOnlySpan<byte> bytes, out string message)
    {
        message = string.Empty;
        if (bytes.Length == 0)
        {
            message = ChooseMessage;
            return null;
        }

        if (bytes.Length > MaxFileBytes)
        {
            message = SizeMessage;
            return null;
        }

        (string Extension, int Width, int Height)? parsed;
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            parsed = ParseJpeg(bytes);
        }
        else if (bytes.Length >= 8 && bytes[..8].SequenceEqual(PngSignature))
        {
            parsed = ParsePng(bytes);
        }
        else if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes.Slice(8, 4).SequenceEqual("WEBP"u8))
        {
            parsed = ParseWebp(bytes);
        }
        else
        {
            message = TypeMessage;
            return null;
        }

        if (parsed is null)
        {
            message = CorruptMessage;
            return null;
        }

        var (extension, width, height) = parsed.Value;
        if (width < MinSide || height < MinSide)
        {
            message = TooSmallMessage;
            return null;
        }

        if (width > MaxSide || height > MaxSide)
        {
            message = TooBigMessage;
            return null;
        }

        return new ProductPhotoInfo(extension, ContentTypeOf("x." + extension), width, height);
    }

    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    // Text that has no business inside a photo: a file that is also a page or a script (a polyglot) is refused whatever its structure says.
    // Only the metadata and text parts are searched (JPEG segments other than the scan data, PNG chunks other than IDAT, WebP chunks other than the image):
    // compressed pixel data is close to random bytes and would now and then spell a marker by chance, refusing a good photo.
    private static readonly string[] MarkupMarkers = ["<script", "<html", "<svg", "<?php", "<!doctype", "<iframe", "javascript:"];

    private static bool ContainsMarkup(ReadOnlySpan<byte> bytes)
    {
        var lower = new byte[bytes.Length];
        for (var i = 0; i < bytes.Length; i++)
        {
            var b = bytes[i];
            lower[i] = b is >= (byte)'A' and <= (byte)'Z' ? (byte)(b + 32) : b;
        }

        foreach (var marker in MarkupMarkers)
        {
            if (lower.AsSpan().IndexOf(Encoding.ASCII.GetBytes(marker)) >= 0)
            {
                return true;
            }
        }

        return false;
    }

    // JPEG: SOI, then marker segments. The frame header (SOF0/1/2: baseline, extended, progressive) gives the size; every scan's entropy data
    // is skipped to the next real marker; the file must end exactly at EOI (anything after it is refused).
    private static (string, int, int)? ParseJpeg(ReadOnlySpan<byte> b)
    {
        var pos = 2;
        int width = 0, height = 0;
        var frame = false;
        var scans = 0;
        while (pos < b.Length)
        {
            if (b[pos] != 0xFF)
            {
                return null;
            }

            while (pos < b.Length && b[pos] == 0xFF)
            {
                pos++; // fill bytes
            }

            if (pos >= b.Length)
            {
                return null;
            }

            var marker = b[pos++];
            if (marker == 0xD9)
            {
                return frame && scans > 0 && pos == b.Length && width > 0 && height > 0 ? ("jpg", width, height) : null;
            }

            if (marker is 0x00 or 0x01 or >= 0xD0 and <= 0xD8)
            {
                if (marker is 0x00 or 0xD8)
                {
                    return null; // a stray stuffed zero or a second SOI
                }

                continue;
            }

            if (pos + 2 > b.Length)
            {
                return null;
            }

            int length = BinaryPrimitives.ReadUInt16BigEndian(b[pos..]);
            if (length < 2 || pos + length > b.Length)
            {
                return null;
            }

            if (ContainsMarkup(b.Slice(pos + 2, length - 2)))
            {
                return null;
            }

            if (marker is >= 0xC0 and <= 0xCF and not 0xC4 and not 0xC8 and not 0xCC)
            {
                if (marker > 0xC2 || frame || length < 8)
                {
                    return null; // lossless, arithmetic, hierarchical or a second frame: not a web photo
                }

                height = BinaryPrimitives.ReadUInt16BigEndian(b[(pos + 3)..]);
                width = BinaryPrimitives.ReadUInt16BigEndian(b[(pos + 5)..]);
                frame = true;
            }

            pos += length;
            if (marker == 0xDA)
            {
                if (!frame)
                {
                    return null;
                }

                scans++;
                // The entropy-coded data: 0xFF 0x00 is a stuffed byte, 0xFF 0xD0-D7 a restart; the next other marker ends the scan.
                while (pos < b.Length)
                {
                    if (b[pos] != 0xFF)
                    {
                        pos++;
                        continue;
                    }

                    if (pos + 1 >= b.Length)
                    {
                        return null;
                    }

                    var next = b[pos + 1];
                    if (next == 0x00 || next is >= 0xD0 and <= 0xD7)
                    {
                        pos += 2;
                    }
                    else if (next == 0xFF)
                    {
                        pos++;
                    }
                    else
                    {
                        break;
                    }
                }
            }
        }

        return null; // no EOI
    }

    // PNG: signature, then length/type/data/CRC chunks; IHDR first, at least one IDAT, IEND last and exactly at the end of the file.
    private static (string, int, int)? ParsePng(ReadOnlySpan<byte> b)
    {
        var pos = 8;
        int width = 0, height = 0;
        var first = true;
        var data = false;
        while (pos + 12 <= b.Length)
        {
            var length = BinaryPrimitives.ReadUInt32BigEndian(b[pos..]);
            if (length > int.MaxValue || pos + 12L + length > b.Length)
            {
                return null;
            }

            var type = b.Slice(pos + 4, 4);
            var body = b.Slice(pos + 8, (int)length);
            if (BinaryPrimitives.ReadUInt32BigEndian(b[(pos + 8 + (int)length)..]) != Crc32(type, body))
            {
                return null;
            }

            if (!type.SequenceEqual("IDAT"u8) && ContainsMarkup(body))
            {
                return null;
            }

            if (first)
            {
                if (!type.SequenceEqual("IHDR"u8) || length != 13)
                {
                    return null;
                }

                width = (int)Math.Min(BinaryPrimitives.ReadUInt32BigEndian(body), int.MaxValue);
                height = (int)Math.Min(BinaryPrimitives.ReadUInt32BigEndian(body[4..]), int.MaxValue);
                first = false;
            }
            else if (type.SequenceEqual("IDAT"u8))
            {
                data = true;
            }
            else if (type.SequenceEqual("IEND"u8))
            {
                return length == 0 && data && pos + 12 == b.Length && width > 0 && height > 0 ? ("png", width, height) : null;
            }

            pos += 12 + (int)length;
        }

        return null;
    }

    // WebP: the RIFF size must match the file; the chunks must tile it exactly; the size comes from VP8 (lossy), VP8L (lossless) or VP8X (extended, not animated).
    private static (string, int, int)? ParseWebp(ReadOnlySpan<byte> b)
    {
        if (BinaryPrimitives.ReadUInt32LittleEndian(b[4..]) + 8L != b.Length || (b.Length & 1) != 0)
        {
            return null;
        }

        var pos = 12;
        int width = 0, height = 0;
        var image = false;
        while (pos + 8 <= b.Length)
        {
            var type = b.Slice(pos, 4);
            var size = BinaryPrimitives.ReadUInt32LittleEndian(b[(pos + 4)..]);
            if (pos + 8L + size + (size & 1) > b.Length)
            {
                return null;
            }

            var body = b.Slice(pos + 8, (int)size);
            if (!type.SequenceEqual("VP8 "u8) && !type.SequenceEqual("VP8L"u8) && !type.SequenceEqual("ALPH"u8) && ContainsMarkup(body))
            {
                return null;
            }

            if (type.SequenceEqual("VP8X"u8))
            {
                if (size != 10 || (body[0] & 0x02) != 0 || pos != 12)
                {
                    return null; // not first, or animated
                }

                width = 1 + (body[4] | body[5] << 8 | body[6] << 16);
                height = 1 + (body[7] | body[8] << 8 | body[9] << 16);
            }
            else if (type.SequenceEqual("VP8 "u8))
            {
                if (size < 10 || body[3] != 0x9D || body[4] != 0x01 || body[5] != 0x2A || image || (body[0] & 1) != 0)
                {
                    return null; // too short, no start code, a second image or not a key frame
                }

                var w = BinaryPrimitives.ReadUInt16LittleEndian(body[6..]) & 0x3FFF;
                var h = BinaryPrimitives.ReadUInt16LittleEndian(body[8..]) & 0x3FFF;
                (width, height) = width == 0 ? (w, h) : (width, height);
                image = true;
            }
            else if (type.SequenceEqual("VP8L"u8))
            {
                if (size < 5 || body[0] != 0x2F || image)
                {
                    return null;
                }

                var w = 1 + (body[1] | (body[2] & 0x3F) << 8);
                var h = 1 + ((body[2] >> 6) | body[3] << 2 | (body[4] & 0x0F) << 10);
                (width, height) = width == 0 ? (w, h) : (width, height);
                image = true;
            }

            pos += 8 + (int)size + (int)(size & 1);
        }

        return pos == b.Length && image && width > 0 && height > 0 ? ("webp", width, height) : null;
    }

    private static readonly uint[] CrcTable = BuildCrcTable();

    private static uint[] BuildCrcTable()
    {
        var table = new uint[256];
        for (uint n = 0; n < 256; n++)
        {
            var c = n;
            for (var k = 0; k < 8; k++)
            {
                c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
            }

            table[n] = c;
        }

        return table;
    }

    /// <summary>The CRC-32 PNG uses over a chunk's type and data.</summary>
    public static uint Crc32(ReadOnlySpan<byte> type, ReadOnlySpan<byte> data)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in type)
        {
            crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8);
        }

        foreach (var b in data)
        {
            crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8);
        }

        return crc ^ 0xFFFFFFFFu;
    }
}
