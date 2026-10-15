using System.Text;

namespace Marvi.Domain.Catalog;

/// <summary>One data row of a CSV file: the line it starts on (the header is line 1) and its cells.</summary>
public sealed record CsvRow(int Line, IReadOnlyList<string> Cells);

public sealed record CsvDocument(IReadOnlyList<string> Header, IReadOnlyList<CsvRow> Rows);

/// <summary>
/// Reads the CSV an admin uploads. Accepts a comma or a semicolon as the separator (Excel in Brazil writes semicolons;
/// it is taken from the header line), quoted cells with doubled quotes and line breaks inside, a leading byte order mark
/// and both kinds of line ending. Blank lines are skipped and cells are trimmed.
/// </summary>
public static class ProductCsv
{
    /// <summary>The document, or the reason the file cannot be read as CSV.</summary>
    public static (CsvDocument? Document, string? Error) Read(string text)
    {
        text = text.TrimStart('﻿');
        if (string.IsNullOrWhiteSpace(text))
        {
            return (null, "The file is empty.");
        }

        // The first non-blank line is the header, whatever the line endings (a lone \r is a line ending too).
        var firstLine = text.Split(['\r', '\n']).FirstOrDefault(l => l.Trim().Length > 0) ?? string.Empty;
        var separator = firstLine.Count(c => c == ';') > firstLine.Count(c => c == ',') ? ';' : ',';

        var records = new List<(int Line, List<string> Cells)>();
        var cells = new List<string>();
        var cell = new StringBuilder();
        var inQuotes = false;
        var cellStarted = false;
        var line = 1;
        var recordLine = 1;
        var quoteLine = 0;
        var afterQuote = false;
        string? malformed = null;

        void EndCell()
        {
            cells.Add(cell.ToString().Trim());
            cell.Clear();
            cellStarted = false;
            afterQuote = false;
        }

        void EndRecord()
        {
            EndCell();
            if (cells.Any(c => c.Length > 0))
            {
                records.Add((recordLine, cells));
            }

            cells = new List<string>();
        }

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"')
                {
                    cell.Append('"');
                    i++;
                }
                else if (c == '"')
                {
                    inQuotes = false;
                    afterQuote = true;
                }
                else if (c == '\r' || c == '\n')
                {
                    // Any line ending inside quotes counts as one line and is kept as a plain line feed.
                    if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n')
                    {
                        i++;
                    }

                    line++;
                    cell.Append('\n');
                }
                else
                {
                    cell.Append(c);
                }

                continue;
            }

            if (afterQuote && c != separator && c != '\n' && c != '\r' && !char.IsWhiteSpace(c))
            {
                malformed = $"Unexpected text after a closing quote on line {line}.";
                break;
            }

            if (c == '"' && !cellStarted)
            {
                inQuotes = true;
                cellStarted = true;
                quoteLine = line;
            }
            else if (c == separator)
            {
                EndCell();
            }
            else if (c == '\n' || c == '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n')
                {
                    i++;
                }

                EndRecord();
                line++;
                recordLine = line;
            }
            else
            {
                cell.Append(c);
                cellStarted = cellStarted || !char.IsWhiteSpace(c);
            }
        }

        if (malformed is not null)
        {
            return (null, malformed);
        }

        if (inQuotes)
        {
            return (null, $"A quoted value that starts on line {quoteLine} is never closed.");
        }

        if (cell.Length > 0 || cells.Count > 0)
        {
            EndRecord();
        }

        if (records.Count == 0)
        {
            return (null, "The file is empty.");
        }

        var header = records[0].Cells;
        var rows = records.Skip(1).Select(r => new CsvRow(r.Line, r.Cells)).ToList();
        return (new CsvDocument(header, rows), null);
    }
}
