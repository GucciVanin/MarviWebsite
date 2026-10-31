import type { DeliveryAddressSnapshot } from './delivery-address.model';

export type QuoteStatus = 'Draft' | 'Submitted' | 'Priced' | 'Accepted' | 'Rejected' | 'Expired';

export interface QuoteLineItem {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  suggestedUnitPrice: number | null;
  finalUnitPrice: number | null;
}

export interface Quote {
  id: string;
  /** The quote number (shown as Q-000123). */
  number: number;
  clientAccountId: string;
  customerNumber: number;
  companyName: string;
  status: QuoteStatus;
  createdAt: string;
  pricedByEmployeeId: string | null;
  lineItems: QuoteLineItem[];
  /** Where it is delivered, as it was when chosen (MRV-9.6); absent or null on a quote made before that. */
  deliveryAddressSnapshot?: DeliveryAddressSnapshot | null;
}
