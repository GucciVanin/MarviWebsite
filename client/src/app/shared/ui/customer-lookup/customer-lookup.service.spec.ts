import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { fakeToken } from '../../../core/auth/testing/fake-token';
import { CustomerLookupService, LOOKUP_CACHE_MS } from './customer-lookup.service';

const profile = { id: 'c-1', customerNumber: 42, companyName: 'Bar do Zé', quotes: [], orders: [], addresses: [] };

describe('CustomerLookupService cache', () => {
  let service: CustomerLookupService;
  let http: HttpTestingController;
  let auth: AuthService;

  const signIn = (role: string, expiresInSeconds?: number) => localStorage.setItem('marvi_auth_token', fakeToken(role, expiresInSeconds));
  const load = () => {
    let shown: unknown = null;
    service.get(42).subscribe((p) => (shown = p));
    return () => shown;
  };

  function setup(tokenSeconds = 3600) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
    localStorage.clear();
    signIn('Employee', tokenSeconds);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CustomerLookupService);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    // The first answer fills the cache.
    load();
    http.expectOne('/api/employee/clients/by-number/42').flush(profile);
  }
  afterEach(() => {
    http.verify();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('reuses a customer opened less than 60 seconds ago: no second request', () => {
    setup();
    vi.advanceTimersByTime(LOOKUP_CACHE_MS - 1000);

    const shown = load();

    http.expectNone('/api/employee/clients/by-number/42');
    expect(shown()).toEqual(profile);
  });

  it('asks the API again once the entry is 60 seconds old, so a change shows on reopening', () => {
    setup();
    vi.advanceTimersByTime(LOOKUP_CACHE_MS);

    load();

    http.expectOne('/api/employee/clients/by-number/42').flush({ ...profile, companyName: 'Novo nome' });
    expect(service.cached(42)?.companyName).toBe('Novo nome');
  });

  it('forgets everything on logout', () => {
    setup();

    auth.logout();

    expect(service.cached(42)).toBeUndefined();
    load();
    http.expectOne('/api/employee/clients/by-number/42').flush(profile); // asked again, not served from the cache
  });

  it('shows another user who signs in on the same page no cached profile', () => {
    setup();
    auth.logout();
    auth.login({ email: 'a@b.c', password: 'x' }).subscribe();
    http.expectOne('/api/auth/login').flush({ token: fakeToken('Admin', 3600), expiresAt: '2026-10-30T13:00:00Z' });

    expect(service.cached(42)).toBeUndefined();
    load();
    http.expectOne('/api/employee/clients/by-number/42').flush(profile);
  });

  it('forgets everything when the session token expires, even inside the 60 seconds', () => {
    setup(30);
    vi.advanceTimersByTime(10_000);
    expect(service.cached(42)).toEqual(profile);

    vi.advanceTimersByTime(25_000);

    expect(service.cached(42)).toBeUndefined();
  });

  it('does not store an answer that arrives after another user signed in', () => {
    setup();
    vi.advanceTimersByTime(LOOKUP_CACHE_MS);
    load(); // user A asks again (the entry is old) ...
    const pending = http.expectOne('/api/employee/clients/by-number/42');
    auth.logout();
    auth.login({ email: 'a@b.c', password: 'x' }).subscribe();
    http.expectOne('/api/auth/login').flush({ token: fakeToken('Admin', 3600), expiresAt: '2026-10-30T13:00:00Z' });

    pending.flush(profile); // ... and the answer comes after the switch

    expect(service.cached(42)).toBeUndefined();
  });
});
