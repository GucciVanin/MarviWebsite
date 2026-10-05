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
