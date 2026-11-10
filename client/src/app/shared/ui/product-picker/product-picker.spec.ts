import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { iconNames } from '../app-icon/testing/icon-names';
import { ProductPicker } from './product-picker';

describe('ProductPicker icons', () => {
  async function setup() {
    TestBed.configureTestingModule({ imports: [ProductPicker], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(ProductPicker);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url === '/api/products').flush([{ id: 'a', sku: 'S-1', name: 'Cafe', imageUrl: null, attributes: {}, price: 5, dealName: null, inStock: true }]);
    http.expectOne('/api/categories').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('keeps the catalog in a focusable scroll box with a name and a named actions column (MRV-8.5)', async () => {
    const { root } = await setup();

    const wrap = root.querySelector('[data-testid="catalog"]')!.parentElement!;
    expect(wrap.classList.contains('table-wrap')).toBe(true);
    expect(wrap.getAttribute('tabindex')).toBe('0');
    expect(wrap.getAttribute('role')).toBe('group');
    expect(wrap.getAttribute('aria-label')).toBe('Catálogo de produtos');
    expect(root.querySelector('[data-testid="catalog"] thead th:last-child')?.textContent?.trim()).toBe('Ações');
  });

  it('marks the filter button with a funnel and each add button with a cart, keeping their text as names', async () => {
    const { fixture, root } = await setup();

    expect(iconNames(fixture, '[data-testid="filters"]')).toEqual(['filter']);
    expect(iconNames(fixture, '[data-testid="catalog"] tbody')).toEqual(['shopping-cart']);
    expect(root.querySelector('[data-testid="filters"] button')?.textContent?.trim()).toBe('Buscar');
    expect(root.querySelector('[data-testid="catalog"] tbody button')?.textContent?.trim()).toBe('Adicionar');
  });

describe('ProductPicker photos (MRV-9.7)', () => {
  it('shows a thumbnail with the product name as alt text, or the placeholder, beside each product', async () => {
    TestBed.configureTestingModule({ imports: [ProductPicker], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(ProductPicker);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const base = { sku: 'S', attributes: {}, price: 5, dealName: null, inStock: true };
    http.expectOne((r) => r.url === '/api/products').flush([
      { id: 'a', name: 'Cafe', imageUrl: '/api/public/media/products/0123456789abcdef0123456789abcdef.png', ...base },
      { id: 'b', name: 'Cha', imageUrl: null, ...base },
    ]);
    http.expectOne('/api/categories').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="catalog"] tbody tr');
    expect(rows[0].querySelector('img')!.getAttribute('alt')).toBe('') // the name sits beside it: decorative for screen readers (axe image-redundant-alt);
    expect(rows[0].querySelector('img')!.getAttribute('width')).toBe('48');
    expect(rows[1].querySelector('img')).toBeNull();
    expect(rows[1].querySelector('app-product-photo')).not.toBeNull();
  });
});
});
