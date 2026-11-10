using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using Marvi.Domain.Catalog;

namespace Marvi.Tests.Support;

/// <summary>
/// Image files built in code for the photo tests (MRV-9.7): no downloaded or committed binaries. The PNG and the JPEG are real, decodable
/// images (the PNG is zlib-compressed rows, the JPEG a baseline frame whose blocks are all flat mid-grey); the WebP files are structurally
/// valid RIFF/VP8 containers whose payload is filler (the API reads headers, it does not decode). The browser check uses real encoder output.
/// </summary>
public static class ImageFixtures
{
    /// <summary>A grey PNG of the given size; <paramref name="realData"/> false writes a tiny IDAT regardless of the size (a header-level fixture for huge sizes).</summary>
    public static byte[] Png(int width, int height, bool realData = true, byte[]? trailing = null, bool breakCrc = false)
    {
        using var output = new MemoryStream();
        output.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        var header = new byte[13];
        BinaryPrimitives.WriteUInt32BigEndian(header, (uint)width);
        BinaryPrimitives.WriteUInt32BigEndian(header.AsSpan(4), (uint)height);
        header[8] = 8; // bit depth
        header[9] = 0; // greyscale
        Chunk(output, "IHDR", header, breakCrc);

        var rows = realData ? new byte[(width + 1) * height] : new byte[1 + width];
        using var compressed = new MemoryStream();
        using (var z = new ZLibStream(compressed, CompressionLevel.Optimal, leaveOpen: true))
        {
            z.Write(rows);
        }

        Chunk(output, "IDAT", compressed.ToArray());
        Chunk(output, "IEND", []);
        if (trailing is not null)
        {
            output.Write(trailing);
        }

        return output.ToArray();
    }

    private static void Chunk(Stream output, string type, byte[] data, bool breakCrc = false)
    {
        var typeBytes = Encoding.ASCII.GetBytes(type);
        var length = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(length, (uint)data.Length);
        output.Write(length);
        output.Write(typeBytes);
        output.Write(data);
        var crc = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(crc, ProductPhotoRules.Crc32(typeBytes, data) ^ (breakCrc ? 1u : 0u));
        output.Write(crc);
    }

    /// <summary>
    /// A baseline JPEG of the given size: one component, one-code Huffman tables (every block is "DC difference 0, end of block" = two zero bits),
    /// so it decodes as flat grey and stays tiny. <paramref name="comment"/> adds a COM segment, <paramref name="paddingBytes"/> filler COM segments,
    /// <paramref name="trailing"/> bytes after EOI, <paramref name="omitEnd"/> drops the EOI.
    /// </summary>
    public static byte[] Jpeg(int width, int height, string? comment = null, int paddingBytes = 0, byte[]? trailing = null, bool omitEnd = false)
    {
        using var o = new MemoryStream();
        void Marker(byte marker, byte[] body)
        {
            o.WriteByte(0xFF);
            o.WriteByte(marker);
            var length = new byte[2];
            BinaryPrimitives.WriteUInt16BigEndian(length, (ushort)(body.Length + 2));
            o.Write(length);
            o.Write(body);
        }

        o.Write([0xFF, 0xD8]);
        Marker(0xE0, [(byte)'J', (byte)'F', (byte)'I', (byte)'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
        if (comment is not null)
        {
            Marker(0xFE, Encoding.ASCII.GetBytes(comment));
        }

        for (var left = paddingBytes; left > 0; left -= 60_000)
        {
            Marker(0xFE, new byte[Math.Min(left, 60_000)]);
        }

        Marker(0xDB, [.. new byte[] { 0 }, .. Enumerable.Repeat((byte)1, 64)]);
        var frame = new byte[] { 8, 0, 0, 0, 0, 1, 1, 0x11, 0 };
        BinaryPrimitives.WriteUInt16BigEndian(frame.AsSpan(1), (ushort)height);
        BinaryPrimitives.WriteUInt16BigEndian(frame.AsSpan(3), (ushort)width);
        Marker(0xC0, frame);
        Marker(0xC4, [.. new byte[] { 0x00, 1 }, .. new byte[15], 0]); // DC table 0: one code of length 1, symbol 0
        Marker(0xC4, [.. new byte[] { 0x10, 1 }, .. new byte[15], 0]); // AC table 0: one code of length 1, symbol 0 (end of block)
        Marker(0xDA, [1, 1, 0x00, 0, 63, 0]);
        var blocks = ((width + 7) / 8) * ((height + 7) / 8);
        o.Write(new byte[(blocks * 2 + 7) / 8]); // two zero bits per block; the last byte's spare bits are zero too (a zero code, harmless)
        if (!omitEnd)
        {
            o.Write([0xFF, 0xD9]);
        }

        if (trailing is not null)
        {
            o.Write(trailing);
        }

        return o.ToArray();
    }

    public enum WebpKind { Lossy, Lossless, Extended }

    public static byte[] Webp(int width, int height, WebpKind kind = WebpKind.Lossy, bool animated = false, int sizeDelta = 0)
    {
        var chunks = new List<byte>();
        void Chunk(string type, byte[] body)
        {
            chunks.AddRange(Encoding.ASCII.GetBytes(type));
            chunks.AddRange(BitConverter.GetBytes((uint)body.Length));
            chunks.AddRange(body);
            if ((body.Length & 1) != 0)
            {
                chunks.Add(0);
            }
        }

        byte[] Lossy()
        {
            var body = new byte[20];
            body[3] = 0x9D; body[4] = 0x01; body[5] = 0x2A;
            BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(6), (ushort)width);
            BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(8), (ushort)height);
            return body;
        }

        byte[] Lossless()
        {
            var body = new byte[16];
            body[0] = 0x2F;
            var w = (uint)(width - 1);
            var h = (uint)(height - 1);
            var bits = w | (h << 14);
            body[1] = (byte)bits; body[2] = (byte)(bits >> 8); body[3] = (byte)(bits >> 16); body[4] = (byte)(bits >> 24);
            return body;
        }

        switch (kind)
        {
            case WebpKind.Lossy:
                Chunk("VP8 ", Lossy());
                break;
            case WebpKind.Lossless:
                Chunk("VP8L", Lossless());
                break;
            default:
                var extended = new byte[10];
                extended[0] = animated ? (byte)0x02 : (byte)0;
                var cw = width - 1;
                var ch = height - 1;
                extended[4] = (byte)cw; extended[5] = (byte)(cw >> 8); extended[6] = (byte)(cw >> 16);
                extended[7] = (byte)ch; extended[8] = (byte)(ch >> 8); extended[9] = (byte)(ch >> 16);
                Chunk("VP8X", extended);
                Chunk("VP8 ", Lossy());
                break;
        }

        var file = new List<byte>();
        file.AddRange("RIFF"u8.ToArray());
        file.AddRange(BitConverter.GetBytes((uint)(chunks.Count + 4 + sizeDelta)));
        file.AddRange("WEBP"u8.ToArray());
        file.AddRange(chunks);
        return file.ToArray();
    }

    public static byte[] Gif() => [.. "GIF89a"u8.ToArray(), .. new byte[] { 0x90, 0x01, 0x90, 0x01, 0x80, 0, 0 }, .. new byte[40], 0x3B];

    public static byte[] Svg() => Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"500\" height=\"500\"><script>alert(1)</script></svg>");

    public static byte[] Html() => Encoding.UTF8.GetBytes("<html><body><script>alert(1)</script></body></html>");

    public static byte[] Pdf() => Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

    public static byte[] Heic() => [0, 0, 0, 0x18, .. "ftypheic"u8.ToArray(), .. new byte[40]];

    public static byte[] Zip() => [0x50, 0x4B, 0x03, 0x04, .. new byte[60]];

    public static byte[] Exe() => [(byte)'M', (byte)'Z', .. new byte[100]];
}
