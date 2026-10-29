import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { jwtInterceptor } from './jwt.interceptor';
import { fakeToken } from './testing/fake-token';
import { ERROR_STATUSES, fail } from '../http/testing/http-testing';

describe('jwtInterceptor on the requests the app makes', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  function setup(token?: string): void {
    localStorage.clear();
    if (token) {
      localStorage.setItem('marvi_auth_token', token);
    }
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([jwtInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  }

  afterEach(() => {
    controller.verify();
    localStorage.clear();
  });

  it.each(['GET', 'POST', 'PUT', 'DELETE'] as const)('adds the bearer token to a signed-in %s call', (method) => {
    const token = fakeToken('Admin');
    setup(token);

    http.request(method, '/api/admin/x', { body: method === 'GET' ? undefined : {} }).subscribe();

    expect(controller.expectOne('/api/admin/x').request.headers.get('Authorization')).toBe(`Bearer ${token}`);
  });

  it('picks the token up as soon as the user signs in, and drops it as soon as they sign out', () => {
    setup();
    const auth = TestBed.inject(AuthService);

    http.get('/api/before').subscribe();
    expect(controller.expectOne('/api/before').request.headers.has('Authorization')).toBe(false);

    auth.login({ email: 'a@x.com', password: 'x' }).subscribe();
    const token = fakeToken('Client');
    controller.expectOne('/api/auth/login').flush({ token, expiresAt: '2099-01-01T00:00:00Z' });

    http.get('/api/during').subscribe();
    expect(controller.expectOne('/api/during').request.headers.get('Authorization')).toBe(`Bearer ${token}`);

    auth.logout();
    http.get('/api/after').subscribe();
    expect(controller.expectOne('/api/after').request.headers.has('Authorization')).toBe(false);
  });

  it('keeps the headers the caller set', () => {
    setup(fakeToken('Client'));

    http.get('/api/x', { headers: new HttpHeaders({ 'X-Custom': '1' }) }).subscribe();

    const headers = controller.expectOne('/api/x').request.headers;
    expect(headers.get('X-Custom')).toBe('1');
    expect(headers.has('Authorization')).toBe(true);
  });

  it('passes a successful answer through untouched and does not touch the session', () => {
    setup(fakeToken('Client'));
    const results: unknown[] = [];

    http.get('/api/ok').subscribe((value) => results.push(value));
    controller.expectOne('/api/ok').flush({ fine: true });

    expect(results).toEqual([{ fine: true }]);
    expect(localStorage.getItem('marvi_auth_token')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(ERROR_STATUSES.filter((status) => status !== 401))('does not sign the user out on an HTTP %i, and reports the same error', (status) => {
    setup(fakeToken('Client'));
    const errors: unknown[] = [];

    http.get('/api/x').subscribe({ error: (failure: unknown) => errors.push(failure) });
    fail(controller.expectOne('/api/x'), status);

    expect(errors).toHaveLength(1);
    expect((errors[0] as HttpErrorResponse).status).toBe(status);
    expect(localStorage.getItem('marvi_auth_token')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('on a 401 reports the very same error object to the caller, after signing out and going to /login', () => {
    setup(fakeToken('Client'));
    const errors: unknown[] = [];

    http.get('/api/x').subscribe({ error: (failure: unknown) => errors.push(failure) });
    fail(controller.expectOne('/api/x'), 401);

    expect((errors[0] as HttpErrorResponse).status).toBe(401);
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('on a 401 for a visitor who was not signed in (a wrong password) also goes to /login', () => {
    setup();
    const errors: unknown[] = [];

    http.post('/api/auth/login', {}).subscribe({ error: (failure: unknown) => errors.push(failure) });
    fail(controller.expectOne('/api/auth/login'), 401);

    expect((errors[0] as HttpErrorResponse).status).toBe(401);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
