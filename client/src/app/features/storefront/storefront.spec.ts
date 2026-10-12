import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Storefront } from './storefront';

describe('Storefront', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [Storefront],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Storefront);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  // Regression: the app is zoneless, and plain-field assignment in an HTTP callback never re-rendered,
  // so the table stayed empty although the API returned products.
  it('renders products and deals once the API responds', async () => {
    const { fixture, http } = setup();

    http.expectOne((r) => r.url === '/api/products').flush([
      { id: 'p1', sku: 'COLA-1', name: 'Cola 2L', imageUrl: null, attributes: {}, price: 12.5, dealName: null, inStock: true },
    ]);
    http.expectOne('/api/deals').flush([
      { id: 'd1', name: 'Verão', discountType: 'Percent', discountValue: 10 },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Cola 2L');
    expect(text).toContain('Verão');
  });

  // Regression: an unpriced product used to arrive as price 0 and read as free.
  it('shows "on request" for a product without a price and the number when there is one', async () => {
    const { fixture, http } = setup();
    http.expectOne((r) => r.url === '/api/products').flush([
      { id: 'p1', sku: 'A', name: 'Com preço', imageUrl: null, attributes: {}, price: 12.5, dealName: null, inStock: true },
      { id: 'p2', sku: 'B', name: 'Sem preço', imageUrl: null, attributes: {}, price: null, dealName: null, inStock: false },
    ]);
    http.expectOne('/api/deals').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('12.5');
    expect(rows[1].textContent).toContain('Sob consulta');
    expect(rows[1].textContent).not.toMatch(/0/);
  });

  it('shows a loading message until the catalog arrives', async () => {
    const { fixture, http } = setup();
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text()).toContain('Carregando');

    http.expectOne((r) => r.url === '/api/products').flush([]);
    http.expectOne('/api/deals').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).not.toContain('Carregando');
  });

  // A failed load used to look exactly like an empty store.
  it('shows an error with a retry, not an empty catalog, when the products request fails', async () => {
    const { fixture, http } = setup();
    http.expectOne((r) => r.url === '/api/products').flush('boom', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/deals').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.textContent).not.toContain('Nenhum produto');

    const retry = root.querySelector<HTMLButtonElement>('[role="alert"] button')!;
    retry.click();
    http.expectOne((r) => r.url === '/api/products').flush([
      { id: 'p1', sku: 'COLA-1', name: 'Cola 2L', imageUrl: null, attributes: {}, price: 12.5, dealName: null, inStock: true },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.textContent).toContain('Cola 2L');
  });

  it('says so when the catalog is genuinely empty', async () => {
    const { fixture, http } = setup();
    http.expectOne((r) => r.url === '/api/products').flush([]);
    http.expectOne('/api/deals').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhum produto');
  });

  it('tells the visitor when the coverage check itself fails, instead of staying silent', async () => {
    const { fixture, http } = setup();
    http.expectOne((r) => r.url === '/api/products').flush([]);
    http.expectOne('/api/deals').flush([]);

    fixture.componentInstance.coverageAddress = 'Rua A, 100';
    fixture.componentInstance.checkCoverage();
    http.expectOne('/api/coverage/check').flush('x', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
  });

  it('shows the coverage result after a check', async () => {
    const { fixture, http } = setup();
    http.expectOne((r) => r.url === '/api/products').flush([]);
    http.expectOne('/api/deals').flush([]);

    fixture.componentInstance.coverageAddress = 'Rua A, 100';
    fixture.componentInstance.checkCoverage();
    http.expectOne('/api/coverage/check').flush({ supported: true, warehouseName: 'Depósito Central' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Depósito Central');
  });
});
