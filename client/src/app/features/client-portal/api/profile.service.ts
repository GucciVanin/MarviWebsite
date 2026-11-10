import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { ClientAddress, ClientAddressRequest } from '../../../shared/models/client-address.model';
import type { ClientProfile, UpdateClientProfileRequest } from '../../../shared/models/client-profile.model';

export type { ClientProfile, UpdateClientProfileRequest } from '../../../shared/models/client-profile.model';
export type { ClientAddress, ClientAddressRequest } from '../../../shared/models/client-address.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  get(): Observable<ClientProfile> {
    return this.http.get<ClientProfile>('/api/client/profile');
  }

  update(request: UpdateClientProfileRequest): Observable<ClientProfile> {
    return this.http.put<ClientProfile>('/api/client/profile', request);
  }

  /** The addresses have their own calls (MRV-9.3); an address is named by its opaque key, never an id. */
  addAddress(request: ClientAddressRequest): Observable<ClientAddress> {
    return this.http.post<ClientAddress>('/api/client/addresses', request);
  }

  updateAddress(key: string, request: ClientAddressRequest): Observable<ClientAddress> {
    return this.http.put<ClientAddress>(`/api/client/addresses/${key}`, request);
  }

  removeAddress(key: string): Observable<void> {
    return this.http.delete<void>(`/api/client/addresses/${key}`);
  }
}
