import type { DeliveryAddressSnapshot } from './delivery-address.model';

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
  /** The order number (shown as P-000045). */
  number: number;
  clientAccountId: string;
  customerNumber: number;
  companyName: string;
  quoteId: string | null;
  status: OrderStatus;
  /** The address on one line; the old free text on an order made before MRV-9.6. */
  deliveryAddress: string;
  /** The structured copy of the address (MRV-9.6); absent or null on such an old order. */
  deliveryAddressSnapshot?: DeliveryAddressSnapshot | null;
  warehouseId: string | null;
  placedByEmployeeId: string | null;
  placedAt: string;
  totalAmount: number;
  lineItems: OrderLineItem[];
}
