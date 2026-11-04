import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { fakeToken } from '../../../core/auth/testing/fake-token';
import { iconNames } from '../../../shared/ui/app-icon/testing/icon-names';
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

  // MRV-9.9: the 403 means "suspended", not "wrong password", and it is said in the company's words.
  it('tells a suspended customer their account is suspended instead of blaming the password', () => {
    const { fixture, http } = setup();
    fixture.componentInstance.email = 'a@b.com';
    fixture.componentInstance.password = 'right';

    fixture.componentInstance.submit();
    http.expectOne('/api/auth/login').flush(
      { code: 'account_suspended', message: 'Sua conta está suspensa. Entre em contato com a empresa.' },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Sua conta está suspensa. Entre em contato com a empresa.');
    expect(element.textContent).not.toContain('Verifique seu e-mail');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(localStorage.getItem('marvi_auth_token')).toBeNull();
  });

  it('shows the same message once when the company ended the session of a signed-in customer', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(AuthService).endSuspendedSession();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('Sua conta está suspensa.');
    expect(TestBed.inject(AuthService).takeSuspendedNotice()).toBe(false);
    // Visiting the page again later shows nothing.
    const again = TestBed.createComponent(Login);
    again.detectChanges();
    expect((again.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
  });

  it('does not treat another 403 as a suspension', () => {
    const { fixture, http } = setup();
    fixture.componentInstance.submit();
    http.expectOne('/api/auth/login').flush('x', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).not.toContain('suspensa');
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

describe('Login icons', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Login], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
  }

  it('shows a mail and a lock icon on the fields and a sign-in icon on the button', () => {
    const { fixture, root } = setup();

    expect(iconNames(fixture, 'form')).toEqual(['mail', 'lock', 'log-in']);
    expect(root.querySelector('.field__control > input#email')).not.toBeNull();
    expect(root.querySelector('.field__control > input#password')).not.toBeNull();
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Entrar');
  });

  it('puts an alert-circle in the error message', () => {
    const { fixture, http } = setup();
    fixture.componentInstance.submit();
    http.expectOne('/api/auth/login').flush('nope', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(iconNames(fixture, '[role="alert"]')).toEqual(['alert-circle']);
  });

  it('renders the form in the shared auth card on the brand backdrop (MRV-7.4)', () => {
    const { fixture } = setup();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.auth-page .container > .card.auth-card')).not.toBeNull();
    expect(element.querySelectorAll('h1').length).toBe(1);
    expect(element.querySelector('button[type="submit"]')!.classList).toContain('btn--primary');
    expect(element.querySelectorAll('.field label').length).toBe(2);
  });
});
