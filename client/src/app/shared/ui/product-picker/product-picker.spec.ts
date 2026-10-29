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

  it('marks the filter button with a funnel and each add button with a cart, keeping their text as names', async () => {
    const { fixture, root } = await setup();

    expect(iconNames(fixture, '[data-testid="filters"]')).toEqual(['filter']);
    expect(iconNames(fixture, '[data-testid="catalog"] tbody')).toEqual(['shopping-cart']);
    expect(root.querySelector('[data-testid="filters"] button')?.textContent?.trim()).toBe('Buscar');
    expect(root.querySelector('[data-testid="catalog"] tbody button')?.textContent?.trim()).toBe('Adicionar');
  });
});
