import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmployeePortal } from './employee-portal';

describe('EmployeePortal', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [EmployeePortal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(EmployeePortal);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), root: fixture.nativeElement as HTMLElement };
  }
  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the quote queue and the inventory once the API responds', async () => {
    const { fixture, http, root } = setup();
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush([
      { id: 'q1', clientAccountId: 'c1', status: 'Submitted', createdAt: '2026-10-02T10:00:00Z', pricedByEmployeeId: null, lineItems: [] },
    ]);
    http.expectOne((r) => r.url.includes('/inventory')).flush([
      { id: 'i1', productName: 'Cola 2L', warehouseId: 'w1', qtyOnHand: 5, qtyReserved: 1, reorderPoint: 2 },
    ]);
    await settle(fixture);

    expect(root.textContent).toContain('c1');
    expect(root.textContent).toContain('Cola 2L');
  });

  // Before: a failed queue looked like "nobody is waiting for a price".
  it('tells a failed quote queue from an empty one, and retries only that section', async () => {
    const { fixture, http, root } = setup();
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush('x', { status: 500, statusText: 'Server Error' });
    http.expectOne((r) => r.url.includes('/inventory')).flush([]);
    await settle(fixture);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.textContent).not.toContain('Nenhuma cotação na fila');
    expect(root.textContent).toContain('Nenhum item em estoque');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush([]);
    await settle(fixture);

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.textContent).toContain('Nenhuma cotação na fila');
  });

  it('reports a failed inventory load', async () => {
    const { fixture, http, root } = setup();
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush([]);
    http.expectOne((r) => r.url.includes('/inventory')).error(new ProgressEvent('error'));
    await settle(fixture);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('conectar ao servidor');
  });

  it('explains a customer lookup that finds nothing (404)', async () => {
    const { fixture, http, root } = setup();
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush([]);
    http.expectOne((r) => r.url.includes('/inventory')).flush([]);
    fixture.componentInstance.lookupClientId = 'missing';

    fixture.componentInstance.lookupClient();
    http.expectOne((r) => r.url.includes('/clients/missing')).flush('Not found', { status: 404, statusText: 'Not Found' });
    await settle(fixture);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Não encontramos');
  });
});
