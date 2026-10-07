namespace Marvi.Domain.Catalog;

public class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>Ascending display order in public listings; ties are broken by name.</summary>
    public int SortOrder { get; set; }
    /// <summary>Inactive categories are hidden from the public listing but keep their products.</summary>
    public bool IsActive { get; set; } = true;
}
