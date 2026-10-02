import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Quote, QuoteStatus } from '../../../shared/models/quote.model';
import type { Order } from '../../../shared/models/order.model';

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
  qtyOnHand: number;
  qtyReserved: number;
  reorderPoint: number;
}

export type ClientAccountStatus = 'Pending' | 'Approved' | 'Suspended';

export interface ClientProfile {
  id: string;
  companyName: string;
  billingAddress: string;
  shippingAddresses: string[];
  creditLimit: number;
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

  getClient(id: string): Observable<ClientProfile> {
    return this.http.get<ClientProfile>(`/api/employee/clients/${id}`);
  }
}
