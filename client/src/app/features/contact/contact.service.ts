import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** What the contact form sends. `website` is the honeypot: people never see the field, so it is always empty for them. */
export interface ContactRequest {
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
  website: string;
}

/** The public contact form endpoint (MRV-2.8). The message is sent and forgotten: nothing is logged or kept client-side. */
@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly http = inject(HttpClient);

  send(request: ContactRequest): Observable<void> {
    return this.http.post<void>('/api/public/contact', request);
  }
}
