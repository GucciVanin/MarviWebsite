import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Register } from './register';

describe('Register', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function setup() {
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  it('shows the shared server message, not a data complaint, when registration hits a server failure', async () => {
    const { fixture, http } = setup();

    fixture.componentInstance.submit();
    http.expectOne('/api/auth/register').flush('x', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('Erro no servidor');
    expect(alert).not.toContain('Verifique os dados');
  });

  it('shows registration problems in Portuguese and re-enables the button', async () => {
    const { fixture, http } = setup();

    fixture.componentInstance.submit();
    http
      .expectOne('/api/auth/register')
      .flush(['Passwords must have at least one non alphanumeric character.'], {
        status: 400,
        statusText: 'Bad Request',
      });
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const alert = element.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('caractere especial');
    expect(alert).not.toContain('Passwords');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
});
