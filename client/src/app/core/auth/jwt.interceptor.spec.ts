import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { jwtInterceptor } from './jwt.interceptor';
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
