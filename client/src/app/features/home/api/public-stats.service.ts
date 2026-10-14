import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** The live numbers behind the landing page (counts only; the API sends no prices or customer data). */
export interface PublicStats {
  productCount: number;
  categoryCount: number;
  coverageAreaCount: number;
}

@Injectable({ providedIn: 'root' })
export class PublicStatsService {
  private readonly http = inject(HttpClient);

  get(): Observable<PublicStats> {
    return this.http.get<PublicStats>('/api/public/stats');
  }
}
