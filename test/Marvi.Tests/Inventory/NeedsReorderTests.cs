using Marvi.Domain.Inventory;

namespace Marvi.Tests.Inventory;

/// <summary>MRV-6.2: when a stock record has run down to its reorder point, at the pure Domain seam.</summary>
public class NeedsReorderTests
{
    private static InventoryRecord Record(int onHand, int reserved, int reorderPoint) =>
        new() { QtyOnHand = onHand, QtyReserved = reserved, ReorderPoint = reorderPoint };

    [Theory]
    [InlineData(50, 0, 20, false)]   // plenty
    [InlineData(20, 0, 20, true)]    // exactly at the reorder point
    [InlineData(5, 0, 20, true)]     // below it
    [InlineData(0, 0, 20, true)]     // out of stock
    [InlineData(30, 15, 20, true)]   // what is reserved is not available: 15 left
    [InlineData(30, 5, 20, false)]   // 25 left
    public void ARecordNeedsReordering_WhenWhatIsAvailableIsAtOrBelowItsReorderPoint(int onHand, int reserved, int reorderPoint, bool expected) =>
        Assert.Equal(expected, StockAvailability.NeedsReorder(Record(onHand, reserved, reorderPoint)));
}
