import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type DiscountType = 'Percent' | 'Fixed';

export interface Deal {
  id: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
}

@Injectable({ providedIn: 'root' })
export class DealsService {
  private readonly http = inject(HttpClient);

  getDeals(): Observable<Deal[]> {
    return this.http.get<Deal[]>('/api/deals');
  }
}
