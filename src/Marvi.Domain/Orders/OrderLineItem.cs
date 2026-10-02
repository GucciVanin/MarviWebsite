using Marvi.Domain.Catalog;

namespace Marvi.Domain.Orders;

public class OrderLineItem
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Order? Order { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public int Qty { get; set; }
    public decimal UnitPrice { get; set; }
}
