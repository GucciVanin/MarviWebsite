import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { fakeToken } from './testing/fake-token';

describe('AuthService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function create(): AuthService {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    return TestBed.inject(AuthService);
  }

  it('sends signed-out visitors to the landing page', () => {
    const service = create();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.homeUrl()).toBe('/');
  });

  it.each([
    ['Client', '/portal'],
    ['Employee', '/employee'],
    ['Admin', '/admin'],
  ])('sends a %s to %s', (role, url) => {
    localStorage.setItem('marvi_auth_token', fakeToken(role));
    const service = create();
    expect(service.role()).toBe(role);
    expect(service.homeUrl()).toBe(url);
  });

  it('forgets the token on logout', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Client'));
    const service = create();
    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('marvi_auth_token')).toBeNull();
  });
});

describe('AuthService with a token shaped like the API issues', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  // Payload copied from a real login response (docker compose run, 2026-10-02): only the long
  // Microsoft claim URI carries the role. Guards against the client looking for a different name.
  const realPayload = {
    sub: '01a0fec3-7e50-79a6-97e7-83cb85bc29c3',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'Marvi.Api',
    aud: 'Marvi.Client',
  };
  const encode = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, '');

  it('reads the role from the real claim name', () => {
    localStorage.setItem('marvi_auth_token', `${encode({ alg: 'HS256' })}.${encode(realPayload)}.sig`);
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(AuthService);
    expect(service.role()).toBe('Admin');
    expect(service.homeUrl()).toBe('/admin');
  });

  it('treats a token without a role as signed out and drops it', () => {
    localStorage.setItem('marvi_auth_token', `${encode({ alg: 'HS256' })}.${encode({ sub: 'x' })}.sig`);
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(AuthService);
    expect(service.role()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.homeUrl()).toBe('/');
    expect(localStorage.getItem('marvi_auth_token')).toBeNull();
  });

  // The session can outlive the token while the page stays open; a memoised check would keep showing "signed in".
  it('notices a token expiring while the app is open', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      localStorage.setItem('marvi_auth_token', fakeToken('Client', 60));
      TestBed.configureTestingModule({ providers: [provideHttpClient()] });
      const service = TestBed.inject(AuthService);
      expect(service.isAuthenticated()).toBe(true);

      vi.setSystemTime(Date.now() + 120_000);

      expect(service.isAuthenticated()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an expired token as signed out and drops it', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Admin', -60));
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.homeUrl()).toBe('/');
    expect(localStorage.getItem('marvi_auth_token')).toBeNull();
  });
});
