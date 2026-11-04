import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { EmployeeService, ClientProfile } from '../../../features/employee-portal/api/employee.service';

/** How long a loaded customer is reused: long enough that closing and reopening the widget is free, short enough that a change shows soon. */
export const LOOKUP_CACHE_MS = 60_000;

interface Entry {
  profile: ClientProfile;
  loadedAt: number;
}

/**
 * The customers the widget has loaded, by customer number (MRV-9.2 AC-8): opening it again within a minute does not ask the API again.
 * The cache belongs to the signed-in session: when the token changes (another user signs in), the user signs out or the token expires,
 * everything is dropped, so one user never sees what another loaded.
 */
@Injectable({ providedIn: 'root' })
export class CustomerLookupService {
  private readonly employeeService = inject(EmployeeService);
  private readonly auth = inject(AuthService);
  private readonly loaded = new Map<number, Entry>();
  private session: string | null = null;

  /** The cached profile, if this session loaded it less than a minute ago. */
  cached(number: number): ClientProfile | undefined {
    this.checkSession();
    const entry = this.loaded.get(number);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.loadedAt >= LOOKUP_CACHE_MS) {
      this.loaded.delete(number);
      return undefined;
    }
    return entry.profile;
  }

  /** The profile from the cache or, once, from the API. A failure is not cached, so a retry asks again. */
  get(number: number): Observable<ClientProfile> {
    const known = this.cached(number);
    if (known) {
      return of(known);
    }
    const asked = this.session;
    return this.employeeService.getClientByNumber(number).pipe(
      tap((profile) => {
        // An answer that arrives after another user signed in (or this one signed out) belongs to the old session: not stored.
        this.checkSession();
        if (this.session === asked) {
          this.loaded.set(number, { profile, loadedAt: Date.now() });
        }
      }),
    );
  }

  /** Forgets a customer (after something changed it) so the next open reloads. */
  forget(number: number): void {
    this.loaded.delete(number);
  }

  /** Drops everything when the signed-in session is not the one that filled the cache (other user, signed out, expired token). */
  private checkSession(): void {
    const current = this.auth.isAuthenticated() ? this.auth.getToken() : null;
    if (current !== this.session) {
      this.loaded.clear();
      this.session = current;
    }
  }
}
