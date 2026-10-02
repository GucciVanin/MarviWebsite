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
  clientAccountId: string;
  status: QuoteStatus;
  createdAt: string;
  pricedByEmployeeId: string | null;
  lineItems: QuoteLineItem[];
}
