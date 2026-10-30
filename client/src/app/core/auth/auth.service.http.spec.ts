import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, fail } from '../http/testing/http-testing';
import { AuthService } from './auth.service';
import { fakeToken } from './testing/fake-token';

const KEY = 'marvi_auth_token';
const ROLE = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
const tokenWith = (claims: object) => `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`;

describe('AuthService requests', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const service = () => TestBed.inject(AuthService);
  const credentials = { email: 'ana@example.com', password: 'Abc123!' };

  describe('register', () => {
    const request = { ...credentials, companyName: 'Bar do Zé', billingAddress: { label: null, kind: null, postalCode: '01001000', street: 'Rua A', number: '1', complement: null, district: 'Sé', city: 'São Paulo', state: 'SP', deliveryNotes: null, isBilling: false, isDefaultDelivery: false } };

    it('posts the registration and hands back the new id without signing in', () => {
      const results: unknown[] = [];

      service().register(request).subscribe((value) => results.push(value));
      const sent = http.expectOne('/api/auth/register');
      expect(sent.request.method).toBe('POST');
      expect(sent.request.body).toEqual(request);
      sent.flush({ id: 'u1' });

      expect(results).toEqual([{ id: 'u1' }]);
      expect(service().isAuthenticated()).toBe(false);
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it.each(ERROR_STATUSES)('passes on an HTTP %i failure and stays signed out', (status) => {
      const errors: unknown[] = [];

      service().register(request).subscribe({ error: (failure: unknown) => errors.push(failure) });
      fail(http.expectOne('/api/auth/register'), status);

      expect((errors[0] as HttpErrorResponse).status).toBe(status);
      expect(service().isAuthenticated()).toBe(false);
    });
  });

  describe('login', () => {
    it('posts the credentials, keeps the token and is signed in with the role from it', () => {
      const token = fakeToken('Employee');
      const results: unknown[] = [];

      service().login(credentials).subscribe((value) => results.push(value));
      const sent = http.expectOne('/api/auth/login');
      expect(sent.request.method).toBe('POST');
      expect(sent.request.body).toEqual(credentials);
      sent.flush({ token, expiresAt: '2099-01-01T00:00:00Z' });

      expect(results).toEqual([{ token, expiresAt: '2099-01-01T00:00:00Z' }]);
      expect(service().getToken()).toBe(token);
      expect(localStorage.getItem(KEY)).toBe(token);
      expect(service().isAuthenticated()).toBe(true);
      expect(service().role()).toBe('Employee');
      expect(service().homeUrl()).toBe('/employee');
    });

    it('replaces the previous session when another user signs in', () => {
      localStorage.setItem(KEY, fakeToken('Client'));
      const replacement = fakeToken('Admin');

      service().login(credentials).subscribe();
      http.expectOne('/api/auth/login').flush({ token: replacement, expiresAt: '2099-01-01T00:00:00Z' });

      expect(service().role()).toBe('Admin');
      expect(localStorage.getItem(KEY)).toBe(replacement);
    });

    it.each(ERROR_STATUSES)('passes on an HTTP %i failure and does not sign anyone in', (status) => {
      const errors: unknown[] = [];

      service().login(credentials).subscribe({ error: (failure: unknown) => errors.push(failure) });
      fail(http.expectOne('/api/auth/login'), status);

      expect((errors[0] as HttpErrorResponse).status).toBe(status);
      expect(service().getToken()).toBeNull();
      expect(service().isAuthenticated()).toBe(false);
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('a failed login leaves an existing session as it was', () => {
      const token = fakeToken('Client');
      localStorage.setItem(KEY, token);

      service().login(credentials).subscribe({ error: () => undefined });
      fail(http.expectOne('/api/auth/login'), 401);

      expect(service().getToken()).toBe(token);
      expect(service().role()).toBe('Client');
    });

    it('logout() after a login leaves no token, no session and the landing page as home', () => {
      service().login(credentials).subscribe();
      http.expectOne('/api/auth/login').flush({ token: fakeToken('Client'), expiresAt: '2099-01-01T00:00:00Z' });

      service().logout();

      expect(service().getToken()).toBeNull();
      expect(service().isAuthenticated()).toBe(false);
      expect(service().homeUrl()).toBe('/');
    });
  });

  describe('reading the token', () => {
    it('exposes the client and employee ids carried by the token', () => {
      localStorage.setItem(KEY, tokenWith({ [ROLE]: 'Client', client_id: 'c-1', employee_id: 'e-1' }));

      expect(service().clientId()).toBe('c-1');
      expect(service().employeeId()).toBe('e-1');
    });

    it('has no ids and no token when signed out', () => {
      expect(service().clientId()).toBeNull();
      expect(service().employeeId()).toBeNull();
      expect(service().getToken()).toBeNull();
    });

    it('takes the first role when the token carries several', () => {
      localStorage.setItem(KEY, tokenWith({ [ROLE]: ['Employee', 'Admin'] }));

      expect(service().role()).toBe('Employee');
      expect(service().homeUrl()).toBe('/employee');
    });

    it('a role the SPA does not know has the landing page as home', () => {
      localStorage.setItem(KEY, tokenWith({ [ROLE]: 'Visitor' }));

      expect(service().homeUrl()).toBe('/');
    });

    it.each([
      ['not a JWT at all', 'garbage'],
      ['a JWT with an empty payload', 'a..c'],
      ['a payload that is not base64', 'a.@@@.c'],
      ['a payload that is not JSON', `a.${btoa('not json')}.c`],
    ])('treats %s as signed out and drops it', (_label, token) => {
      localStorage.setItem(KEY, token);

      expect(service().isAuthenticated()).toBe(false);
      expect(service().role()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('reads a base64url payload (- and _ instead of + and /)', () => {
      const payload = encode({ [ROLE]: 'Client', exp: Math.floor(Date.now() / 1000) + 3600, filler: '>>>???' })
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      localStorage.setItem(KEY, `h.${payload}.s`);

      expect(service().role()).toBe('Client');
    });

    it('a token without an expiry never expires on the client (the API decides)', () => {
      localStorage.setItem(KEY, `${encode({ alg: 'none' })}.${encode({ [ROLE]: 'Admin' })}.sig`);

      expect(service().isAuthenticated()).toBe(true);
    });
  });
});
