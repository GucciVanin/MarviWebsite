import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { fakeToken } from '../../../core/auth/testing/fake-token';
import { Login } from './login';

describe('Login', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function setup() {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return {
      fixture,
      http: TestBed.inject(HttpTestingController),
      router: TestBed.inject(Router),
    };
  }

  it('shows a Portuguese error and re-enables the button when login fails', () => {
    const { fixture, http } = setup();
    fixture.componentInstance.email = 'a@b.com';
    fixture.componentInstance.password = 'wrong';

    fixture.componentInstance.submit();
    http.expectOne('/api/auth/login').flush('nope', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível entrar');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  // "Check your email and password" is the wrong advice when the server is down.
  it('does not blame the credentials when the server or network fails', () => {
    const { fixture, http } = setup();
    const element = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.submit();
    http.expectOne('/api/auth/login').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('conectar ao servidor');

    fixture.componentInstance.submit();
    http.expectOne('/api/auth/login').flush('x', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
  });

  it('sends the user to the area for their role after login', () => {
    const { fixture, http, router } = setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.submit();
    http
      .expectOne('/api/auth/login')
      .flush({ token: fakeToken('Employee'), expiresAt: new Date().toISOString() });

    expect(navigate).toHaveBeenCalledWith('/employee');
  });
});
