import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { ClientProfile, UpdateClientProfileRequest } from '../../../shared/models/client-profile.model';

export type { ClientProfile, UpdateClientProfileRequest } from '../../../shared/models/client-profile.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  get(): Observable<ClientProfile> {
    return this.http.get<ClientProfile>('/api/client/profile');
  }

  update(request: UpdateClientProfileRequest): Observable<ClientProfile> {
    return this.http.put<ClientProfile>('/api/client/profile', request);
  }
}
