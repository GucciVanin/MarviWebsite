import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CoverageCheckRequest {
  address: string;
}

export interface CoverageCheckResult {
  supported: boolean;
  warehouseName: string | null;
}

@Injectable({ providedIn: 'root' })
export class CoverageService {
  private readonly http = inject(HttpClient);

  check(request: CoverageCheckRequest): Observable<CoverageCheckResult> {
    return this.http.post<CoverageCheckResult>('/api/coverage/check', request);
  }
}
