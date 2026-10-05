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
    const email = type('input[placeholder="Email"]', 'ana@marvi.test');
    const password = type('input[placeholder="Password"]', 'Secret-123!');
    const code = type('input[placeholder="Employee Code"]', 'E-1');
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
});
