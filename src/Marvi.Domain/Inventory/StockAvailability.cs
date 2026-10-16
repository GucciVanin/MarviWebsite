namespace Marvi.Domain.Inventory;

/// <summary>
/// Stock availability (MRV-4.10), defined once: what a product can still be sold from is what is on hand minus what is
/// reserved, summed over every warehouse that holds it. A product is in stock when that is above zero.
/// </summary>
public static class StockAvailability
{
    /// <summary>Available units of one product from its inventory records (one per warehouse). No records means 0.</summary>
    public static int Available(IEnumerable<InventoryRecord> records) => records.Sum(r => r.QtyOnHand - r.QtyReserved);

    public static bool InStock(IEnumerable<InventoryRecord> records) => Available(records) > 0;

    /// <summary>A stock record has run down to its reorder point (MRV-6.2): what is available there is at or below it. Out of stock counts.</summary>
    public static bool NeedsReorder(InventoryRecord record) => record.QtyOnHand - record.QtyReserved <= record.ReorderPoint;

    /// <summary>Available units per product for many products at once; a product with no records is simply absent (0).</summary>
    public static IReadOnlyDictionary<Guid, int> AvailableByProduct(IEnumerable<InventoryRecord> records) =>
        records.GroupBy(r => r.ProductId).ToDictionary(g => g.Key, g => Available(g));

    public static bool InStock(IReadOnlyDictionary<Guid, int> availableByProduct, Guid productId) =>
        availableByProduct.TryGetValue(productId, out var available) && available > 0;
}
