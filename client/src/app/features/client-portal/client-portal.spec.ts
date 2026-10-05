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
    expect(rows[0].textContent).toContain('Accept');
    expect(rows[1].textContent).not.toContain('Accept');
  });

  // Regression: resetting form fields inside the HTTP callback did not re-render (zoneless), so the old values stayed on screen.
  it('clears the quote form after a quote is requested', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/quotes/mine').flush([]);
    http.expectOne('/api/orders/mine').flush([]);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[placeholder="Product ID"]')!;
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
