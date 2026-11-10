namespace Marvi.Api.Features.Catalog.Contracts;

/// <summary>What an import did, or would do (`DryRun`). `Applied` is false for a dry run and for a file with errors, which imports nothing.</summary>
public record ProductImportReportDto(bool DryRun, bool Applied, int Rows, int Created, int Updated, List<ProductImportErrorDto> Errors);

/// <summary>One problem in the file. Line 1 is the header; a row's line is where it starts in the file. A problem about one row also names its SKU and the field (sku, name, description, price, stock, attributes, a tier_ column...).</summary>
public record ProductImportErrorDto(int Line, string Message, string? Sku = null, string? Field = null);
