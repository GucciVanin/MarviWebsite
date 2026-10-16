import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientPortal } from './client-portal';

const product = (id: string, name: string, price: number | null, inStock = true) => ({
  id,
  sku: `SKU-${id}`,
  name,
  imageUrl: null,
  attributes: {},
  price,
  dealName: null,
  inStock,
});

const quote = (id: string, status: string, lines: object[] = []) => ({
  id,
  clientAccountId: 'c1',
  status,
  createdAt: '2026-10-02T13:00:00Z',
  pricedByEmployeeId: null,
  lineItems: lines,
});

const line = (productName: string, qty: number, suggested: number | null, final: number | null) => ({
  id: `l-${productName}`,
  productId: `p-${productName}`,
  productName,
  qty,
  suggestedUnitPrice: suggested,
  finalUnitPrice: final,
});

interface Data {
  products?: object[];
  categories?: object[];
  quotes?: object[];
  orders?: object[];
  /** The customer's account status; Approved unless a test says otherwise. */
  status?: string;
}

describe('ClientPortal', () => {
  function setup(data: Data = {}) {
    TestBed.configureTestingModule({
      imports: [ClientPortal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ClientPortal);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const status = data.status ?? 'Approved';
    http.expectOne('/api/quotes/mine').flush(data.quotes ?? []);
    http.expectOne('/api/orders/mine').flush(data.orders ?? []);
    // The portal and the details card each ask for the profile.
    http.match('/api/client/profile').forEach((request) =>
      request.flush({ id: 'c1', companyName: 'Bar do Zé', billingAddress: 'Rua A, 1', shippingAddresses: [], status, createdAt: '2026-10-14T13:42:00Z' }),
    );
    fixture.detectChanges();
    // Only an approved customer gets the quote builder, so the catalog is asked for only then.
    if (status === 'Approved') {
      http.expectOne((r) => r.url === '/api/products').flush(data.products ?? []);
      http.expectOne('/api/categories').flush(data.categories ?? []);
    }
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    return { fixture, http, root, settle, button };
  }

  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  // ---- least privilege: a customer who is not approved cannot build quotes

  it('tells a pending customer their account awaits approval, and offers no way to build a quote', async () => {
    const { root, settle } = setup({ status: 'Pending' });
    await settle();

    expect(text(root)).toContain('aguardando a aprovação da Marvi');
    expect(root.querySelector('app-product-picker')).toBeNull();
    expect(text(root)).not.toContain('Solicitar cotação');
    // They can still keep their own details up to date.
    expect(root.querySelector('#profile-company')).not.toBeNull();
  });

  it('tells a suspended customer their account is suspended, and offers no way to build a quote', async () => {
    const { root, settle } = setup({ status: 'Suspended' });
    await settle();

    expect(text(root)).toContain('Sua conta está suspensa');
    expect(root.querySelector('app-product-picker')).toBeNull();
  });

  it('says nothing about approval to an approved customer', async () => {
    const { root, settle } = setup();
    await settle();

    expect(text(root)).not.toContain('aguardando a aprovação');
    expect(text(root)).not.toContain('suspensa');
    expect(root.querySelector('app-product-picker')).not.toBeNull();
  });

  // ---- picking products

  it('lists the catalog with price, stock and "on request" for unpriced products', async () => {
    const { root, settle } = setup({
      products: [product('1', 'Cola 2L', 12.5), product('2', 'Água 500ml', null, false)],
    });
    await settle();

    const rows = root.querySelectorAll('[data-testid="catalog"] tbody tr');
    expect(rows[0].textContent).toContain('Cola 2L');
    expect(rows[0].textContent).toContain('R$');
    expect(rows[0].textContent).toContain('12,50');
    expect(rows[0].textContent).toContain('Disponível');
    expect(rows[1].textContent).toContain('Sob consulta');
    expect(rows[1].textContent).toContain('Sem estoque');
  });

  it('searches and filters the catalog by category', async () => {
    const { fixture, http, root, settle } = setup({
      categories: [{ id: 'cat-1', name: 'Refrigerantes', productCount: 3 }],
    });
    await settle();
    expect(root.querySelector<HTMLSelectElement>('select')!.textContent).toContain('Refrigerantes');

    const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'cola';
    search.dispatchEvent(new Event('input'));
    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));
    root.querySelector<HTMLFormElement>('form[data-testid="filters"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = http.expectOne((r) => r.url === '/api/products');
    expect(request.request.params.get('search')).toBe('cola');
    expect(request.request.params.get('category')).toBe('cat-1');
    request.flush([product('1', 'Cola 2L', 12.5)]);
    await settle();
    expect(text(root)).toContain('Cola 2L');
  });

  it('says so when no product matches', async () => {
    const { root, settle } = setup({ products: [] });
    await settle();

    expect(text(root)).toContain('Nenhum produto encontrado');
  });

  // ---- the quote basket

  it('adds products to the quote, adding again raises the quantity, and a line can be removed', async () => {
    const { root, settle, button } = setup({ products: [product('1', 'Cola 2L', 12.5), product('2', 'Água', 3)] });
    await settle();
    const catalogRows = () => root.querySelectorAll('[data-testid="catalog"] tbody tr');

    button('Adicionar', catalogRows()[0]).click();
    button('Adicionar', catalogRows()[0]).click();
    button('Adicionar', catalogRows()[1]).click();
    await settle();

    const basketRows = root.querySelectorAll('[data-testid="basket"] tbody tr');
    expect(basketRows.length).toBe(2);
    expect(basketRows[0].textContent).toContain('Cola 2L');
    expect(basketRows[0].querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('2');

    button('Remover', basketRows[1]).click();
    await settle();
    expect(root.querySelectorAll('[data-testid="basket"] tbody tr').length).toBe(1);
  });

  it('cannot send an empty quote, and says what to do', async () => {
    const { root, settle, button } = setup();
    await settle();

    expect(text(root)).toContain('Nenhum item ainda');
    expect(button('Solicitar cotação').disabled).toBe(true);
  });

  it('sends the quote with the chosen products and quantities, then clears the basket and reloads the quotes', async () => {
    const { fixture, http, root, settle, button } = setup({ products: [product('1', 'Cola 2L', 12.5)] });
    await settle();
    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();
    const qty = root.querySelector<HTMLInputElement>('[data-testid="basket"] input[type="number"]')!;
    qty.value = '6';
    qty.dispatchEvent(new Event('input'));
    await settle();

    button('Solicitar cotação').click();
    fixture.detectChanges();
    const post = http.expectOne('/api/quotes');
    expect(post.request.body).toEqual({ lineItems: [{ productId: '1', qty: 6 }] });
    post.flush(quote('q1', 'Submitted'));
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Submitted', [line('Cola 2L', 6, 12.5, null)])]);
    await settle();

    expect(text(root)).toContain('Cotação enviada');
    expect(root.querySelectorAll('[data-testid="basket"] tbody tr').length).toBe(0);
    expect(text(root)).toContain('Aguardando preço');
  });

  it('shows why a quote could not be sent and keeps the basket', async () => {
    const { fixture, http, root, settle, button } = setup({ products: [product('1', 'Cola 2L', 12.5)] });
    await settle();
    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();

    button('Solicitar cotação').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes').flush('Client account is not active.', { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('não tem permissão');
    expect(root.querySelectorAll('[data-testid="basket"] tbody tr').length).toBe(1);
  });

  // ---- my quotes

  it('shows each quote with its lines, prices and a readable status', async () => {
    const { root, settle } = setup({
      quotes: [
        quote('q1', 'Priced', [line('Cola 2L', 6, 12.5, 11), line('Água', 2, null, 3)]),
        quote('q2', 'Submitted', [line('Suco', 1, 8, null)]),
      ],
    });
    await settle();

    const cards = root.querySelectorAll('[data-testid="quote"]');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Preço definido');
    expect(cards[0].textContent).toContain('Cola 2L');
    expect(cards[0].textContent).toContain('11,00');
    expect(cards[0].textContent).toContain('12,50');
    expect(cards[1].textContent).toContain('Aguardando preço');
    expect(cards[1].textContent).toContain('Aguardando');
  });

  it('offers to accept only a priced quote', async () => {
    const { root, settle, button } = setup({
      quotes: [quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)]), quote('q2', 'Submitted'), quote('q3', 'Accepted')],
    });
    await settle();

    const cards = root.querySelectorAll('[data-testid="quote"]');
    expect(button('Aceitar cotação', cards[0])).toBeDefined();
    expect(Array.from(cards[1].querySelectorAll('button'))).toEqual([]);
    expect(Array.from(cards[2].querySelectorAll('button'))).toEqual([]);
  });

  it('accepts a priced quote, then shows the new order and the accepted quote', async () => {
    const { fixture, http, root, settle, button } = setup({
      quotes: [quote('q1', 'Priced', [line('Cola 2L', 2, 12.5, 11)])],
    });
    await settle();

    button('Aceitar cotação').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/q1/accept').flush({});
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Accepted', [line('Cola 2L', 2, 12.5, 11)])]);
    http.expectOne('/api/orders/mine').flush([
      { id: 'o1', clientAccountId: 'c1', quoteId: 'q1', status: 'Placed', deliveryAddress: '', warehouseId: null, placedByEmployeeId: null, placedAt: '2026-10-14T13:42:00Z', totalAmount: 22,
        lineItems: [{ id: 'ol1', productId: 'p1', productName: 'Cola 2L', qty: 2, unitPrice: 11 }] },
    ]);
    await settle();

    expect(text(root)).toContain('Aceita');
    expect(root.querySelector('[data-testid="order"]')!.textContent).toContain('22,00');
  });

  it('rejects a priced quote only after a confirming click, then shows it as refused', async () => {
    const { fixture, http, root, settle, button } = setup({
      quotes: [quote('q1', 'Priced', [line('Cola 2L', 2, 12.5, 11)])],
    });
    await settle();

    button('Recusar cotação').click();
    fixture.detectChanges();
    http.expectNone('/api/quotes/q1/reject');
    expect(text(root)).toContain('Confirmar recusa');

    button('Confirmar recusa').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/q1/reject').flush(quote('q1', 'Rejected', [line('Cola 2L', 2, 12.5, 11)]));
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Rejected', [line('Cola 2L', 2, 12.5, 11)])]);
    await settle();

    expect(text(root)).toContain('Recusada');
    expect(Array.from(root.querySelectorAll('[data-testid="quote"] button'))).toEqual([]);
  });

  it('lets the customer back out of rejecting a quote', async () => {
    const { fixture, http, root, settle, button } = setup({ quotes: [quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)])] });
    await settle();

    button('Recusar cotação').click();
    fixture.detectChanges();
    button('Cancelar').click();
    fixture.detectChanges();

    http.expectNone('/api/quotes/q1/reject');
    expect(text(root)).not.toContain('Confirmar recusa');
    expect(button('Recusar cotação')).toBeDefined();
  });

  it('explains a refused rejection in pt-BR', async () => {
    const { fixture, http, root, settle, button } = setup({ quotes: [quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)])] });
    await settle();

    button('Recusar cotação').click();
    fixture.detectChanges();
    button('Confirmar recusa').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/q1/reject').flush('Quote must be in Priced status', { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('dados enviados são inválidos');
  });

  // The API refuses a suspended customer with 403 and a message; the screen must say so in pt-BR.
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
      const { fixture, http, root, settle, button } = setup({ quotes: [quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)])] });
      await settle();

      button('Aceitar cotação').click();
      fixture.detectChanges();
      const request = http.expectOne('/api/quotes/q1/accept');
      if (status === 0) {
        request.error(new ProgressEvent('error'));
      } else {
        request.flush('Client account is not active.', { status, statusText: 'x' });
      }
      await settle();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain(expected);
    });
  }

  it('shows the server text as secondary detail on a failed accept', async () => {
    const { fixture, http, root, settle, button } = setup({ quotes: [quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)])] });
    await settle();

    button('Aceitar cotação').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/q1/accept').flush('Client account is not active.', { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(root.querySelector('[role="alert"] small')?.textContent).toContain('Client account is not active.');
  });

  it('tells a failed quote list from an empty one, and retries', async () => {
    TestBed.configureTestingModule({
      imports: [ClientPortal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ClientPortal);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/quotes/mine').flush('x', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/orders/mine').flush([]);
    http.match('/api/client/profile').forEach((request) =>
      request.flush({ id: 'c1', companyName: 'Bar', billingAddress: 'Rua A', shippingAddresses: [], status: 'Approved', createdAt: '2026-10-14T13:42:00Z' }),
    );
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/products').flush([]);
    http.expectOne('/api/categories').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(text(root)).not.toContain('Nenhuma cotação ainda');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne('/api/quotes/mine').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root)).toContain('Nenhuma cotação ainda');
  });

  // ---- my orders

  it('shows each order with its lines, total and status', async () => {
    const { root, settle } = setup({
      orders: [
        { id: 'o1', clientAccountId: 'c1', quoteId: 'q1', status: 'Fulfilled', deliveryAddress: 'Rua A, 10', warehouseId: null, placedByEmployeeId: null, placedAt: '2026-10-14T13:42:00Z', totalAmount: 1234.5,
          lineItems: [{ id: 'ol1', productId: 'p1', productName: 'Cola 2L', qty: 2, unitPrice: 617.25 }] },
      ],
    });
    await settle();

    const card = root.querySelector('[data-testid="order"]')!;
    expect(card.textContent).toContain('Entregue');
    expect(card.textContent).toContain('Rua A, 10');
    expect(card.textContent).toContain('Realizado em 14/10/2026');
    expect(card.textContent).toContain('Cola 2L');
    expect(card.textContent).toContain('1.234,50');
  });

  it('says so when there are no orders yet', async () => {
    const { root, settle } = setup();
    await settle();

    expect(text(root)).toContain('Nenhum pedido ainda');
  });
});
