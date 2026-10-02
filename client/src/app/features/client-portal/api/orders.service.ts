import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import type { Order } from '../../../shared/models/order.model';

export type { Order, OrderLineItem, OrderStatus } from '../../../shared/models/order.model';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);

  getMine(): Observable<Order[]> {
    return this.http.get<Order[]>('/api/orders/mine');
  }
}
