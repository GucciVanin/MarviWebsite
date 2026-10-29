import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** The admin's side of the contact messages (MRV-2.8c): marking one handled so it leaves the inbox. */
@Injectable({ providedIn: 'root' })
export class ContactMessagesService {
  private readonly http = inject(HttpClient);

  /** 204 when marked; 404 when it no longer exists; 409 when another admin handled it first. */
  handle(id: string): Observable<void> {
    return this.http.post<void>(`/api/admin/contact-messages/${encodeURIComponent(id)}/handle`, {});
  }
}
