export type OrderStatus = 'Placed' | 'Backordered' | 'Fulfilled' | 'Cancelled';

export interface OrderLineItem {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  clientAccountId: string;
  quoteId: string | null;
  status: OrderStatus;
  deliveryAddress: string;
  warehouseId: string | null;
  placedByEmployeeId: string | null;
  totalAmount: number;
  lineItems: OrderLineItem[];
}
