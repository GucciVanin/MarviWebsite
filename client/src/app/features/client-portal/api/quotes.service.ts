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
}

@Injectable({ providedIn: 'root' })
export class QuotesService {
  private readonly http = inject(HttpClient);

  createQuote(request: CreateQuoteRequest): Observable<Quote> {
    return this.http.post<Quote>('/api/quotes', request);
  }

  getMine(): Observable<Quote[]> {
    return this.http.get<Quote[]>('/api/quotes/mine');
  }

  accept(id: string): Observable<Order> {
    return this.http.post<Order>(`/api/quotes/${id}/accept`, {});
  }
}
