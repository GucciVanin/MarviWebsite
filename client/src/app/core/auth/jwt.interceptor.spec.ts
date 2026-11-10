import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { jwtInterceptor } from './jwt.interceptor';
import { AuthService } from './auth.service';
import { fakeToken } from './testing/fake-token';

describe('jwtInterceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([jwtInterceptor])), provideHttpClientTesting()],
    });
  });
  afterEach(() => localStorage.clear());

  it('sends the bearer token when signed in and none when anonymous', () => {
    const http = TestBed.inject(HttpClient);
    const controller = TestBed.inject(HttpTestingController);

    http.get('/api/anon').subscribe();
    expect(controller.expectOne('/api/anon').request.headers.has('Authorization')).toBe(false);

    const token = fakeToken('Client');
    localStorage.setItem('marvi_auth_token', token);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([jwtInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(HttpClient).get('/api/mine').subscribe();
    expect(TestBed.inject(HttpTestingController).expectOne('/api/mine').request.headers.get('Authorization')).toBe(`Bearer ${token}`);
  });

  it('signs the user out and sends them to the login page on a 401, and still reports the error', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Client'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const failure = vi.fn();

    TestBed.inject(HttpClient).get('/api/mine').subscribe({ error: failure });
    TestBed.inject(HttpTestingController).expectOne('/api/mine').flush('x', { status: 401, statusText: 'Unauthorized' });

    expect(localStorage.getItem('marvi_auth_token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(failure).toHaveBeenCalled();
  });

  // MRV-9.9: the company suspended the account after the person signed in; the API answers every request with 403 and a code.
  it('ends the session on the suspension answer and keeps the reason for the login page, but not on any other 403', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Client'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const auth = TestBed.inject(AuthService);
    const failure = vi.fn();

    TestBed.inject(HttpClient).get('/api/quotes/mine').subscribe({ error: failure });
    TestBed.inject(HttpTestingController).expectOne('/api/quotes/mine').flush(
      { code: 'account_suspended', message: 'Sua conta está suspensa. Entre em contato com a empresa.' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(localStorage.getItem('marvi_auth_token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(failure).toHaveBeenCalled();
    expect(auth.takeSuspendedNotice()).toBe(true);
    expect(auth.takeSuspendedNotice()).toBe(false); // shown once
  });

  // MRV-9.9 O-4: the gate also answers public API calls made with the old token (the storefront), so a public page ends the session too, once.
  it('ends the session once on a public page call (the catalogue) and sends no token afterwards, so there is no loop', () => {
    const token = fakeToken('Client');
    localStorage.setItem('marvi_auth_token', token);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const http = TestBed.inject(HttpClient);
    const controller = TestBed.inject(HttpTestingController);

    http.get('/api/products').subscribe({ error: () => undefined });
    const first = controller.expectOne('/api/products');
    expect(first.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    first.flush({ code: 'account_suspended', message: 'x' }, { status: 403, statusText: 'Forbidden' });

    expect(localStorage.getItem('marvi_auth_token')).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(TestBed.inject(AuthService).takeSuspendedNotice()).toBe(true);

    http.get('/api/products').subscribe();
    const retry = controller.expectOne('/api/products');
    expect(retry.request.headers.has('Authorization')).toBe(false);
    retry.flush([]);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('leaves the sign-in request to the login page when it is the one refused', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const auth = TestBed.inject(AuthService);

    TestBed.inject(HttpClient).post('/api/auth/login', {}).subscribe({ error: () => undefined });
    TestBed.inject(HttpTestingController).expectOne('/api/auth/login').flush(
      { code: 'account_suspended', message: 'x' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(navigate).not.toHaveBeenCalled();
    expect(auth.takeSuspendedNotice()).toBe(false);
  });

  it('leaves the session alone on other failures (403, 500) and passes the error on', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Client'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const failure = vi.fn();
    const controller = TestBed.inject(HttpTestingController);
    const http = TestBed.inject(HttpClient);

    http.get('/api/a').subscribe({ error: failure });
    controller.expectOne('/api/a').flush('x', { status: 403, statusText: 'Forbidden' });
    http.get('/api/b').subscribe({ error: failure });
    controller.expectOne('/api/b').flush('x', { status: 500, statusText: 'Server Error' });

    expect(localStorage.getItem('marvi_auth_token')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(2);
  });
});
