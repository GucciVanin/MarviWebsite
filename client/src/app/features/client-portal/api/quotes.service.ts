import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Order } from './orders.service';
import type { Quote } from '../../../shared/models/quote.model';

export type { Quote, QuoteLineItem, QuoteStatus } from '../../../shared/models/quote.model';

export interface QuoteLineItemRequest {
  productId: string;
  qty: number;
}

export interface CreateQuoteRequest {
  lineItems: QuoteLineItemRequest[];
  /** The key of the customer's address to deliver to (MRV-9.6); omitted means their default delivery address. */
  deliveryAddressKey?: string | null;
}

@Injectable({ providedIn: 'root' })
export class QuotesService {
  private readonly http = inject(HttpClient);

  createQuote(request: CreateQuoteRequest): Observable<Quote> {
    return this.http.post<Quote>('/api/quotes', request);
  }

  /** Another delivery address for a quote that is not accepted yet; the quote is named by its number, the address by its key. */
  changeDeliveryAddress(number: number, deliveryAddressKey: string): Observable<Quote> {
    return this.http.put<Quote>(`/api/quotes/${number}/delivery-address`, { deliveryAddressKey });
  }

  getMine(): Observable<Quote[]> {
    return this.http.get<Quote[]>('/api/quotes/mine');
  }

  reject(id: string): Observable<Quote> {
    return this.http.post<Quote>(`/api/quotes/${id}/reject`, {});
  }

  accept(id: string): Observable<Order> {
    return this.http.post<Order>(`/api/quotes/${id}/accept`, {});
  }
}
