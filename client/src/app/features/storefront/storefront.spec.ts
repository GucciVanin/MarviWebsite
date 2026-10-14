import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { fakeToken } from '../../core/auth/testing/fake-token';
import { Storefront } from './storefront';

const product = (id: string, name: string, price: number | null, extra: object = {}) => ({
  id, sku: `SKU-${id}`, name, imageUrl: null, attributes: {}, price, dealName: null, inStock: true, ...extra,
});

describe('Storefront (public catalog)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function setup(query: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [Storefront],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Storefront);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    /** Answers the three requests the page makes on load. */
    const loadWith = async (data: { products?: object[]; categories?: object[]; deals?: object[] } = {}) => {
      http.expectOne((r) => r.url === '/api/products').flush(data.products ?? []);
      http.expectOne('/api/categories').flush(data.categories ?? []);
      http.expectOne('/api/deals').flush(data.deals ?? []);
      await settle();
    };
    return { fixture, http, root, settle, loadWith, navigate };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  // ---- browsing

  it('lists the catalog as cards with list price, "on request" for unpriced products, deal and stock', async () => {
    const { root, loadWith } = setup();
    await loadWith({
      products: [
        product('1', 'Cola 2L', 12.5, { dealName: 'Verão' }),
        product('2', 'Água 500ml', null, { inStock: false }),
      ],
    });

    const cards = root.querySelectorAll('[data-testid="product"]');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Cola 2L');
    expect(cards[0].textContent).toContain('12,50');
    expect(cards[0].textContent).toContain('Verão');
    expect(cards[0].textContent).toContain('Disponível');
    expect(cards[1].textContent).toContain('Sob consulta');
    expect(cards[1].textContent).toContain('Sem estoque');
    expect(cards[1].textContent).not.toMatch(/R\$\s*0/);
  });

  it('shows a loading message until the catalog arrives, then an empty message when there is nothing', async () => {
    const { root, loadWith } = setup();
    expect(text(root)).toContain('Carregando');

    await loadWith();

    expect(text(root)).not.toContain('Carregando');
    expect(text(root)).toContain('Nenhum produto encontrado');
  });

  // A failed load used to look exactly like an empty store.
  it('shows an error with a retry, not an empty catalog, when the products request fails', async () => {
    const { http, root, settle } = setup();
    http.expectOne((r) => r.url === '/api/products').flush('boom', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/categories').flush([]);
    http.expectOne('/api/deals').flush([]);
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(text(root)).not.toContain('Nenhum produto encontrado');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne((r) => r.url === '/api/products').flush([product('1', 'Cola 2L', 12.5)]);
    await settle();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root)).toContain('Cola 2L');
  });

  // ---- search and category filter, driven by the URL so links can point at a filtered catalog

  it('offers the active categories as a filter', async () => {
    const { root, loadWith } = setup();
    await loadWith({ categories: [{ id: 'c1', name: 'Refrigerantes', productCount: 3 }, { id: 'c2', name: 'Águas', productCount: 1 }] });

    const options = Array.from(root.querySelectorAll('select option')).map((o) => o.textContent?.trim());
    expect(options).toEqual(['Todas as categorias', 'Refrigerantes', 'Águas']);
  });

  it('applies the search and category from the URL on arrival (a landing-page tile link)', async () => {
    const { http, root, settle } = setup({ category: 'c1', q: 'cola' });

    const request = http.expectOne((r) => r.url === '/api/products');
    expect(request.request.params.get('category')).toBe('c1');
    expect(request.request.params.get('search')).toBe('cola');
    request.flush([product('1', 'Cola 2L', 12.5)]);
    http.expectOne('/api/categories').flush([{ id: 'c1', name: 'Refrigerantes', productCount: 3 }]);
    http.expectOne('/api/deals').flush([]);
    await settle();

    expect(root.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('cola');
    expect(root.querySelector<HTMLSelectElement>('select')!.value).toBe('c1');
  });

  it('searches and filters, reloading the list and recording the filters in the URL', async () => {
    const { fixture, http, root, settle, loadWith, navigate } = setup();
    await loadWith({ categories: [{ id: 'c1', name: 'Refrigerantes', productCount: 3 }] });

    const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'água';
    search.dispatchEvent(new Event('input'));
    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = 'c1';
    select.dispatchEvent(new Event('change'));
    await settle();
    root.querySelector<HTMLFormElement>('form[data-testid="filters"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = http.expectOne((r) => r.url === '/api/products');
    expect(request.request.params.get('search')).toBe('água');
    expect(request.request.params.get('category')).toBe('c1');
    request.flush([]);
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { category: 'c1', q: 'água' }, replaceUrl: true }));
  });

  // ---- calling visitors to register

  it('invites a visitor to create an account to ask for quotes', async () => {
    const { root, loadWith } = setup();
    await loadWith();

    const link = root.querySelector<HTMLAnchorElement>('a[href="/register"]')!;
    expect(link.textContent).toContain('Crie sua conta');
  });

  it('sends a signed-in customer to their area instead', async () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Client'));
    const { root, loadWith } = setup();
    await loadWith();

    expect(root.querySelector('a[href="/register"]')).toBeNull();
    expect(root.querySelector<HTMLAnchorElement>('a[href="/portal"]')!.textContent).toContain('Montar cotação');
  });

  // ---- coverage

  it('tells the visitor whether the company delivers to their address', async () => {
    const { fixture, http, root, settle, loadWith } = setup();
    await loadWith();
    const address = root.querySelector<HTMLInputElement>('input[name="coverageAddress"]')!;
    address.value = 'Rua A, 100';
    address.dispatchEvent(new Event('input'));
    await settle();

    root.querySelector<HTMLFormElement>('form[data-testid="coverage"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    const request = http.expectOne('/api/coverage/check');
    expect(request.request.body).toEqual({ address: 'Rua A, 100' });
    request.flush({ supported: true, warehouseName: 'Depósito Central' });
    await settle();

    expect(root.querySelector('[data-testid="coverage-result"]')!.textContent).toContain('Depósito Central');
  });

  it('says "not covered" in plain words, and reports a failed check instead of staying silent', async () => {
    const { fixture, http, root, settle, loadWith } = setup();
    await loadWith();
    const address = root.querySelector<HTMLInputElement>('input[name="coverageAddress"]')!;
    address.value = 'Rua Z, 1';
    address.dispatchEvent(new Event('input'));
    await settle();
    const form = root.querySelector<HTMLFormElement>('form[data-testid="coverage"]')!;

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectOne('/api/coverage/check').flush({ supported: false, warehouseName: null });
    await settle();
    expect(root.querySelector('[data-testid="coverage-result"]')!.textContent).toContain('Fora da área de entrega');

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectOne('/api/coverage/check').flush('x', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(root.querySelector('[data-testid="coverage-section"] [role="alert"]')?.textContent).toContain('Erro no servidor');
  });

  it('does not check coverage without an address', async () => {
    const { fixture, http, root, settle, loadWith } = setup();
    await loadWith();

    root.querySelector<HTMLFormElement>('form[data-testid="coverage"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await settle();

    http.expectNone('/api/coverage/check');
  });

  // ---- deals

  it('shows the running deals with a readable discount', async () => {
    const { root, loadWith } = setup();
    await loadWith({
      deals: [
        { id: 'd1', name: 'Verão', discountType: 'Percent', discountValue: 10, startDate: '2026-10-01T00:00:00Z', endDate: '2026-11-01T00:00:00Z' },
        { id: 'd2', name: 'Leve mais', discountType: 'Fixed', discountValue: 2, startDate: '2026-10-01T00:00:00Z', endDate: '2026-11-01T00:00:00Z' },
      ],
    });

    const deals = text(root);
    expect(deals).toContain('Verão');
    expect(deals).toContain('10%');
    expect(deals).toContain('R$');
    expect(deals).not.toContain('Percent');
  });
});
