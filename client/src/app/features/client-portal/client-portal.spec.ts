import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientPortal } from './client-portal';

const quote = (id: string, status: string) => ({
  id,
  clientAccountId: 'c1',
  status,
  createdAt: '2026-10-02T10:00:00Z',
  pricedByEmployeeId: null,
  lineItems: [],
});

describe('ClientPortal', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [ClientPortal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ClientPortal);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  // Regression: the API used to send quote status as a number (2), so this button could never show.
  it('offers Accept only for priced quotes, using the status names the API sends', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Priced'), quote('q2', 'Submitted')]);
    http.expectOne('/api/orders/mine').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Aceitar');
    expect(rows[1].textContent).not.toContain('Aceitar');
  });

  // Regression: resetting form fields inside the HTTP callback did not re-render (zoneless), so the old values stayed on screen.
  it('clears the quote form after a quote is requested', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/quotes/mine').flush([]);
    http.expectOne('/api/orders/mine').flush([]);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[placeholder="ID do produto"]')!;
    input.value = 'prod-1';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.componentInstance.requestQuote();
    http.expectOne('/api/quotes').flush({});
    http.expectOne('/api/quotes/mine').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.value).toBe('');
  });

  // The API deliberately answers a suspended customer with 403 and a message; the screen must not swallow it.
  const statusMessages: [number, string][] = [
    [400, 'dados enviados são inválidos'],
    [403, 'não tem permissão'],
    [404, 'Não encontramos'],
    [409, 'conflito'],
    [500, 'Erro no servidor'],
    [0, 'conectar ao servidor'],
  ];
  for (const [status, expected] of statusMessages) {
    it(`explains a failed accept in pt-BR for HTTP ${status}`, async () => {
      const { fixture, http } = setup();
      http.expectOne('/api/quotes/mine').flush([quote('q1', 'Priced')]);
      http.expectOne('/api/orders/mine').flush([]);

      fixture.componentInstance.acceptQuote('q1');
      const request = http.expectOne('/api/quotes/q1/accept');
      if (status === 0) {
        request.error(new ProgressEvent('error'));
      } else {
        request.flush('Account is suspended.', { status, statusText: 'x' });
      }
      await fixture.whenStable();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(expected);
    });
  }

  it('shows the server text as secondary detail on a failed action', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Priced')]);
    http.expectOne('/api/orders/mine').flush([]);

    fixture.componentInstance.acceptQuote('q1');
    http.expectOne('/api/quotes/q1/accept').flush('Account is suspended.', { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')!;
    expect(alert.querySelector('small')?.textContent).toContain('Account is suspended.');
  });

  it('shows an error for a failed quote request and clears it on the next success', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/quotes/mine').flush([]);
    http.expectOne('/api/orders/mine').flush([]);
    fixture.componentInstance['newProductId'].set('p1');

    fixture.componentInstance.requestQuote();
    http.expectOne('/api/quotes').flush('bad', { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')).not.toBeNull();

    fixture.componentInstance.requestQuote();
    http.expectOne('/api/quotes').flush({});
    http.expectOne('/api/quotes/mine').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('tells a failed quote list from an empty one, and retries', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/quotes/mine').flush('x', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/orders/mine').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.textContent).not.toContain('Nenhuma cotação');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne('/api/quotes/mine').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.textContent).toContain('Nenhuma cotação');
  });

  it('accepts a priced quote and reloads quotes and orders', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Priced')]);
    http.expectOne('/api/orders/mine').flush([]);

    fixture.componentInstance.acceptQuote('q1');
    http.expectOne('/api/quotes/q1/accept').flush({});
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Accepted')]);
    http.expectOne('/api/orders/mine').flush([
      { id: 'o1', status: 'Placed', deliveryAddress: 'Rua A', totalAmount: 110, lineItems: [] },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Accepted');
    expect(text).toContain('Placed');
  });
});
