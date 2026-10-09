import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminPortal } from './admin-portal';

describe('AdminPortal', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AdminPortal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(AdminPortal);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    // The portal loads five lists on init; none of them matter here.
    http.match((request) => request.method === 'GET').forEach((request) => request.flush([]));
    return { fixture, http };
  }

  // Regression: the form was reset in the HTTP callback with plain fields, so the typed email and password stayed visible.
  it('clears the new-employee form once the employee is created', async () => {
    const { fixture, http } = setup();
    const element = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      return input;
    };
    const email = type('input[placeholder="E-mail"]', 'ana@marvi.test');
    const password = type('input[placeholder="Senha"]', 'Secret-123!');
    const code = type('input[placeholder="Código do funcionário"]', 'E-1');
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.createEmployee();
    const request = http.expectOne((r) => r.method === 'POST');
    expect(request.request.body).toMatchObject({ email: 'ana@marvi.test', employeeCode: 'E-1' });
    request.flush({});
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect([email.value, password.value, code.value]).toEqual(['', '', '']);
  });

  // The portal loads five lists independently; one failing must not hide or fake the others.
  it('reports a failed audit log without blanking the other lists, and retries it', async () => {
    TestBed.configureTestingModule({
      imports: [AdminPortal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(AdminPortal);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    http.match((r) => r.method === 'GET' && !r.url.includes('audit-log')).forEach((r) => r.flush([]));
    http.expectOne((r) => r.url.includes('audit-log')).flush('x', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    const alerts = root.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
    expect(alerts[0].textContent).toContain('Erro no servidor');

    alerts[0].querySelector('button')!.click();
    http.expectOne((r) => r.url.includes('audit-log')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps what was typed and explains the problem when creating an employee fails', async () => {
    const { fixture, http } = setup();
    const root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable(); // ngModel writes its initial value asynchronously; type after it has
    const email = root.querySelector<HTMLInputElement>('input[placeholder="E-mail"]')!;
    email.value = 'ana@marvi.test';
    email.dispatchEvent(new Event('input'));
    fixture.componentInstance['newEmployeePassword'].set('Secret-123!');
    fixture.componentInstance['newEmployeeCode'].set('E-1');

    fixture.componentInstance.createEmployee();
    http.expectOne((r) => r.method === 'POST').flush('Email is already taken.', { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('conflito');
    expect(email.value).toBe('ana@marvi.test');
  });
});
