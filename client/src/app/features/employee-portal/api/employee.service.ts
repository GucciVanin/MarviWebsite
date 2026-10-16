import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Quote, QuoteStatus } from '../../../shared/models/quote.model';
import type { Order } from '../../../shared/models/order.model';
import type { ClientSummary } from '../../../shared/models/client-summary.model';
import type { PagedResult } from '../../../shared/models/paged.model';

export type { ClientSummary } from '../../../shared/models/client-summary.model';

export interface PriceQuoteLineRequest {
  lineItemId: string;
  finalUnitPrice: number;
}

export interface PriceQuoteRequest {
  lineItems: PriceQuoteLineRequest[];
}

export interface EmployeeOrderLineItemRequest {
  productId: string;
  qty: number;
}

export interface CreateEmployeeOrderRequest {
  clientId: string;
  deliveryAddress: string;
  lineItems: EmployeeOrderLineItemRequest[];
}

export interface InventoryRecord {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  qtyOnHand: number;
  qtyReserved: number;
  reorderPoint: number;
}

export type ClientAccountStatus = 'Pending' | 'Approved' | 'Suspended';

export const CLIENT_SEARCH_PAGE_SIZE = 10;

/** A quote in the history: the quote plus the company it is for. */
export interface QuoteHistoryItem extends Quote {
  companyName: string;
}

/** An order in the history: the order plus the company it is for. */
export interface OrderHistoryItem extends Order {
  companyName: string;
}

/** The filters and page of a history request; `from` is inclusive, `to` exclusive, both ISO instants. */
export interface HistoryQuery {
  clientId?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

function historyParams(query: HistoryQuery): Record<string, string> {
  const params: Record<string, string> = { page: String(query.page), pageSize: String(query.pageSize) };
  for (const key of ['clientId', 'status', 'from', 'to'] as const) {
    const value = query[key];
    if (value) {
      params[key] = value;
    }
  }
  return params;
}

export interface ClientProfile {
  id: string;
  companyName: string;
  billingAddress: string;
  shippingAddresses: string[];
  pricingTierName: string | null;
  status: ClientAccountStatus;
  quotes: Quote[];
  orders: Order[];
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly http = inject(HttpClient);

  getQuoteQueue(status?: QuoteStatus): Observable<Quote[]> {
    const params: Record<string, string> = {};
    if (status) {
      params['status'] = status;
    }
    return this.http.get<Quote[]>('/api/employee/quotes/queue', { params });
  }

  priceQuote(id: string, request: PriceQuoteRequest): Observable<Quote> {
    return this.http.put<Quote>(`/api/employee/quotes/${id}/price`, request);
  }

  createOrder(request: CreateEmployeeOrderRequest): Observable<Order> {
    return this.http.post<Order>('/api/employee/orders', request);
  }

  getInventory(warehouseId?: string): Observable<InventoryRecord[]> {
    const params: Record<string, string> = {};
    if (warehouseId) {
      params['warehouseId'] = warehouseId;
    }
    return this.http.get<InventoryRecord[]>('/api/employee/inventory', { params });
  }

  /** Customers whose company name contains the text (an empty text lists everyone), the first page only. */
  searchClients(search: string): Observable<PagedResult<ClientSummary>> {
    return this.http.get<PagedResult<ClientSummary>>('/api/employee/clients', { params: { search, pageSize: CLIENT_SEARCH_PAGE_SIZE } });
  }

  getQuoteHistory(query: HistoryQuery): Observable<PagedResult<QuoteHistoryItem>> {
    return this.http.get<PagedResult<QuoteHistoryItem>>('/api/employee/quotes/history', { params: historyParams(query) });
  }

  getOrderHistory(query: HistoryQuery): Observable<PagedResult<OrderHistoryItem>> {
    return this.http.get<PagedResult<OrderHistoryItem>>('/api/employee/orders/history', { params: historyParams(query) });
  }

  getClient(id: string): Observable<ClientProfile> {
    return this.http.get<ClientProfile>(`/api/employee/clients/${id}`);
  }
}
