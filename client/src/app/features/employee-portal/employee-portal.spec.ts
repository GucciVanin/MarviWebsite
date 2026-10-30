import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmployeePortal } from './employee-portal';

const line = (id: string, productName: string, qty: number, suggested: number | null) => ({
  id,
  productId: `p-${id}`,
  productName,
  qty,
  suggestedUnitPrice: suggested,
  finalUnitPrice: null,
});

const quote = (id: string, lines: object[], clientAccountId = 'c-123') => ({
  id,
  number: Number(id.replace(/\D/g, '')),
  clientAccountId,
  customerNumber: 42,
  companyName: 'Bar do Zé',
  status: 'Submitted',
  createdAt: '2026-10-02T13:00:00Z',
  pricedByEmployeeId: null,
  lineItems: lines,
});

const summary = (id: string, companyName: string, status: string) => ({ id, customerNumber: 42, companyName, status, pricingTierName: 'Atacado' });
const clientPage = (items: object[], totalCount = items.length) => ({ items, page: 1, pageSize: 10, totalCount });

const profile = (status: string) => ({
  id: 'c-123',
  customerNumber: 42,
  companyName: 'Bar do Zé',
  createdAt: '2026-10-14T13:42:00Z',
  billingAddress: 'Rua A, 1',
  shippingAddresses: [],
  pricingTierName: 'Atacado',
  status,
  quotes: [],
  orders: [],
});

const product = (id: string, name: string, price: number | null = 10) => ({
  id, sku: `SKU-${id}`, name, imageUrl: null, attributes: {}, price, dealName: null, inStock: true,
});

describe('EmployeePortal', () => {
  function setup(data: { queue?: object[]; inventory?: object[] } = {}) {
    TestBed.configureTestingModule({
      imports: [EmployeePortal],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(EmployeePortal);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush(data.queue ?? []);
    http.expectOne((r) => r.url.includes('/inventory')).flush(data.inventory ?? []);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const type = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    /** Finds the customer by company name and opens them, the way an employee does (search, then pick). */
    const openCustomer = async (id: string, status: string) => {
      await type(root.querySelector<HTMLInputElement>('input[name="clientSearch"]')!, 'bar');
      button('Buscar cliente').click();
      fixture.detectChanges();
      http.expectOne((r) => r.url === '/api/employee/clients').flush(clientPage([summary(id, 'Bar do Zé', status)]));
      await settle();
      button('Selecionar').click();
      fixture.detectChanges();
      http.expectOne((r) => r.url.includes(`/clients/${id}`)).flush(profile(status));
      await settle();
    };
    return { fixture, http, root, settle, button, type, openCustomer };
  }

  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  // ---- the quote queue and pricing

  it('lists the queue with each quote\'s lines, and the suggested prices ready to confirm', async () => {
    const { root, settle } = setup({
      queue: [quote('q1', [line('l1', 'Cola 2L', 6, 8.5), line('l2', 'Produto novo', 1, null)])],
    });
    await settle();

    const card = root.querySelector('[data-testid="queue-quote"]')!;
    // The customer is named by company and customer number, never by id; the quote by its number.
    expect(card.textContent).toContain('Cliente: Bar do Zé (C-000042)');
    expect(card.textContent).toContain('Cotação Q-000001');
    expect(card.textContent).not.toContain('c-123');
    expect(card.textContent).toContain('Cola 2L');
    const inputs = card.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(inputs[0].value).toBe('8.5');
    expect(inputs[1].value).toBe('');
  });

  it('sends the final price of every line and reloads the queue', async () => {
    const { fixture, http, root, settle, button, type } = setup({
      queue: [quote('q1', [line('l1', 'Cola 2L', 6, 8.5), line('l2', 'Produto novo', 1, null)])],
    });
    await settle();
    const inputs = root.querySelectorAll<HTMLInputElement>('[data-testid="queue-quote"] input[type="number"]');
    await type(inputs[0], '8');
    await type(inputs[1], '12.9');

    button('Enviar preços').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/employee/quotes/q1/price');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ lineItems: [{ lineItemId: 'l1', finalUnitPrice: 8 }, { lineItemId: 'l2', finalUnitPrice: 12.9 }] });
    put.flush(quote('q1', []));
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush([]);
    await settle();

    expect(text(root)).toContain('Preços enviados ao cliente');
    expect(text(root)).toContain('Nenhuma cotação aguardando preço');
  });

  it('does not send a quote with a line left without a price, and says so', async () => {
    const { fixture, http, root, settle, button } = setup({ queue: [quote('q1', [line('l1', 'Produto novo', 1, null)])] });
    await settle();

    button('Enviar preços').click();
    fixture.detectChanges();
    await settle();

    http.expectNone((r) => r.url.includes('/price'));
    expect(root.querySelector('[data-testid="queue-quote"] [role="alert"]')?.textContent).toContain('Informe o preço final de todos os itens');
  });

  it('does not send a negative price', async () => {
    const { fixture, http, root, settle, button, type } = setup({ queue: [quote('q1', [line('l1', 'Cola 2L', 1, 8.5)])] });
    await settle();
    await type(root.querySelector<HTMLInputElement>('[data-testid="queue-quote"] input[type="number"]')!, '-3');

    button('Enviar preços').click();
    fixture.detectChanges();
    await settle();

    http.expectNone((r) => r.url.includes('/price'));
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('zero ou maior');
  });

  it('shows the API\'s refusal inside the quote it concerns, in pt-BR', async () => {
    const { fixture, http, root, settle, button } = setup({
      queue: [quote('q1', [line('l1', 'Cola 2L', 1, 8.5)]), quote('q2', [line('l2', 'Água', 1, 2)])],
    });
    await settle();

    button('Enviar preços', root.querySelectorAll('[data-testid="queue-quote"]')[1]).click();
    fixture.detectChanges();
    http.expectOne('/api/employee/quotes/q2/price').flush('Quote must be in Submitted status.', { status: 400, statusText: 'Bad Request' });
    await settle();

    const cards = root.querySelectorAll('[data-testid="queue-quote"]');
    expect(cards[1].querySelector('[role="alert"]')?.textContent).toContain('dados enviados são inválidos');
    expect(cards[1].querySelector('[role="alert"] small')?.textContent).toContain('Quote must be in Submitted status.');
    expect(cards[0].querySelector('[role="alert"]')).toBeNull();
  });

  it('tells a failed quote queue from an empty one, and retries only that section', async () => {
    TestBed.configureTestingModule({ imports: [EmployeePortal], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(EmployeePortal);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush('x', { status: 500, statusText: 'Server Error' });
    http.expectOne((r) => r.url.includes('/inventory')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(text(root)).not.toContain('Nenhuma cotação aguardando preço');
    expect(text(root)).toContain('Nenhum item em estoque');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root)).toContain('Nenhuma cotação aguardando preço');
  });

  it('keeps the queue and inventory tables in their own scroll boxes, focusable and named (MRV-8.5)', async () => {
    const { root, settle } = setup({
      queue: [quote('q1', [line('l1', 'Cola 2L', 6, 8.5)]), quote('q2', [line('l2', 'Água', 1, 2)])],
      inventory: [{ id: 'i1', productId: 'p1', productName: 'Cola 2L', warehouseId: 'w1', warehouseName: 'CD São Paulo', qtyOnHand: 5, qtyReserved: 1, reorderPoint: 2 }],
    });
    await settle();

    const tables = Array.from(root.querySelectorAll('table'));
    expect(tables.length).toBe(3);
    const ids = tables.map((table) => {
      const wrap = table.parentElement as HTMLElement;
      expect(wrap.classList.contains('table-wrap')).toBe(true);
      expect(wrap.getAttribute('tabindex')).toBe('0');
      expect(wrap.getAttribute('role')).toBe('group');
      expect(root.querySelector('#' + wrap.getAttribute('aria-labelledby'))).not.toBeNull();
      return wrap.getAttribute('aria-labelledby');
    });
    expect(new Set(ids).size).toBe(3);
  });

  // ---- inventory

  it('shows the stock and reports a failed inventory load', async () => {
    const { root, settle } = setup({
      inventory: [{ id: 'i1', productId: 'p1', productName: 'Cola 2L', warehouseId: 'w1', warehouseName: 'CD São Paulo', qtyOnHand: 5, qtyReserved: 1, reorderPoint: 2 }],
    });
    await settle();
    expect(text(root)).toContain('Cola 2L');
    // The warehouse is named, not shown as an id.
    expect(text(root)).toContain('CD São Paulo');
    expect(text(root)).not.toContain('w1');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [EmployeePortal], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const failing = TestBed.createComponent(EmployeePortal);
    failing.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url.includes('/quotes/queue')).flush([]);
    http.expectOne((r) => r.url.includes('/inventory')).error(new ProgressEvent('error'));
    await failing.whenStable();
    failing.detectChanges();
    expect((failing.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('conectar ao servidor');
  });

  // ---- the customer and a new order

  it('finds customers by company name, lists who matched, and opens the one picked', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type(root.querySelector<HTMLInputElement>('input[name="clientSearch"]')!, '  zé ');

    button('Buscar cliente').click();
    fixture.detectChanges();
    const search = http.expectOne((r) => r.url === '/api/employee/clients');
    expect(search.request.params.get('search')).toBe('zé');
    expect(search.request.params.get('pageSize')).toBe('10');
    search.flush(clientPage([summary('c-123', 'Bar do Zé', 'Approved'), summary('c-456', 'Zé Mercado', 'Suspended')]));
    await settle();

    const rows = root.querySelectorAll('[data-testid="client-match"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Bar do Zé');
    expect(rows[0].textContent).toContain('C-000042');
    expect(rows[1].textContent).toContain('Zé Mercado');
    expect(rows[1].textContent).toContain('Suspenso');

    button('Selecionar', rows[0]).click();
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('/clients/c-123')).flush(profile('Approved'));
    await settle();

    const card = root.querySelector('[data-testid="customer"]')!;
    expect(card.textContent).toContain('Bar do Zé');
    expect(card.textContent).toContain('(C-000042)');
    expect(card.textContent).not.toContain('c-123');
    expect(card.textContent).toContain('Aprovado');
    expect(card.textContent).toContain('Atacado');
    expect(card.textContent).toContain('Cliente desde 14/10/2026');
    expect(card.textContent).not.toMatch(/crédito|limite/i);
  });

  it('says so when no customer matches the company name', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type(root.querySelector<HTMLInputElement>('input[name="clientSearch"]')!, 'nada');

    button('Buscar cliente').click();
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/employee/clients').flush(clientPage([]));
    await settle();

    expect(text(root)).toContain('Nenhum cliente encontrado');
  });

  it('tells the employee when there are more matches than shown, and to narrow the search', async () => {
    const { fixture, http, root, settle, button } = setup();
    await settle();

    button('Buscar cliente').click();
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/employee/clients').flush(clientPage([summary('c-1', 'Bar 1', 'Approved')], 37));
    await settle();

    expect(text(root)).toContain('Mostrando 1 de 37');
    expect(text(root)).toContain('Refine a busca');
  });

  it('explains a failed search in pt-BR', async () => {
    const { fixture, http, root, settle, button } = setup();
    await settle();

    button('Buscar cliente').click();
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/employee/clients').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.querySelector('[data-testid="client-match"]')).toBeNull();
  });

  it('explains a picked customer that no longer exists (404)', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type(root.querySelector<HTMLInputElement>('input[name="clientSearch"]')!, 'bar');
    button('Buscar cliente').click();
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/employee/clients').flush(clientPage([summary('gone', 'Bar Fantasma', 'Approved')]));
    await settle();

    button('Selecionar').click();
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('/clients/gone')).flush('Not found', { status: 404, statusText: 'Not Found' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Não encontramos');
  });

  it('lets the employee use a queued quote\'s customer without retyping the ID', async () => {
    const { fixture, http, root, settle, button } = setup({ queue: [quote('q1', [line('l1', 'Cola 2L', 1, 8.5)], 'c-123')] });
    await settle();

    button('Consultar cliente', root.querySelector('[data-testid="queue-quote"]')!).click();
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('/clients/c-123')).flush(profile('Approved'));
    await settle();

    expect(root.querySelector('[data-testid="customer"]')!.textContent).toContain('Bar do Zé');
  });

  it('offers no order form for a customer who is not approved', async () => {
    const { root, settle, openCustomer } = setup();
    await settle();
    await openCustomer('c-123', 'Suspended');

    expect(text(root)).toContain('Suspenso');
    expect(text(root)).toContain('não está aprovado');
    expect(root.querySelector('[data-testid="order-form"]')).toBeNull();
  });

  async function openOrderForm(env: ReturnType<typeof setup>) {
    const { http, settle, openCustomer } = env;
    await settle();
    await openCustomer('c-123', 'Approved');
    http.expectOne((r) => r.url === '/api/products').flush([product('1', 'Cola 2L'), product('2', 'Água')]);
    http.expectOne('/api/categories').flush([]);
    await settle();
  }

  it('places an order for an approved customer with the chosen products, quantities and address', async () => {
    const env = setup();
    const { fixture, http, root, settle, button, type } = env;
    await openOrderForm(env);
    const catalogRows = () => root.querySelectorAll('[data-testid="catalog"] tbody tr');
    button('Adicionar', catalogRows()[0]).click();
    button('Adicionar', catalogRows()[0]).click();
    button('Adicionar', catalogRows()[1]).click();
    await settle();
    await type(root.querySelector<HTMLInputElement>('input[name="deliveryAddress"]')!, 'Rua Entrega, 10');

    button('Registrar pedido').click();
    fixture.detectChanges();
    const post = http.expectOne('/api/employee/orders');
    expect(post.request.body).toEqual({
      clientId: 'c-123',
      deliveryAddress: 'Rua Entrega, 10',
      lineItems: [{ productId: '1', qty: 2 }, { productId: '2', qty: 1 }],
    });
    post.flush({
      id: 'o1', number: 45, clientAccountId: 'c-123', customerNumber: 42, companyName: 'Bar do Zé', quoteId: null, status: 'Placed', deliveryAddress: 'Rua Entrega, 10', warehouseId: null, placedByEmployeeId: 'e1', placedAt: '2026-10-14T13:42:00Z',
      totalAmount: 30, lineItems: [{ id: 'ol1', productId: '1', productName: 'Cola 2L', qty: 2, unitPrice: 10 }, { id: 'ol2', productId: '2', productName: 'Água', qty: 1, unitPrice: 10 }],
    });
    await settle();

    expect(root.querySelector('[data-testid="placed-order"]')!.textContent).toContain('Pedido registrado. P-000045');
    expect(root.querySelector('[data-testid="placed-order"]')!.textContent).toContain('R$');
    expect(root.querySelector('[data-testid="placed-order"]')!.textContent).toContain('30,00');
    expect(root.querySelectorAll('[data-testid="order-basket"] tbody tr').length).toBe(0);
  });

  it('cannot register an order without an address and at least one product', async () => {
    const env = setup();
    const { root, settle, button, type } = env;
    await openOrderForm(env);
    expect(button('Registrar pedido').disabled).toBe(true);

    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();
    expect(button('Registrar pedido').disabled).toBe(true);

    await type(root.querySelector<HTMLInputElement>('input[name="deliveryAddress"]')!, 'Rua Entrega, 10');
    expect(button('Registrar pedido').disabled).toBe(false);
  });

  it('shows why an order was refused (an unpriced product) and keeps what was typed', async () => {
    const env = setup();
    const { fixture, http, root, settle, button, type } = env;
    await openOrderForm(env);
    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();
    await type(root.querySelector<HTMLInputElement>('input[name="deliveryAddress"]')!, 'Rua Entrega, 10');

    button('Registrar pedido').click();
    fixture.detectChanges();
    http.expectOne('/api/employee/orders').flush("Product 'SKU-1' has no price configured for pricing tier 'Atacado'.", { status: 400, statusText: 'Bad Request' });
    await settle();

    const alert = root.querySelector('[data-testid="order-form"] [role="alert"]')!;
    expect(alert.textContent).toContain('dados enviados são inválidos');
    expect(alert.querySelector('small')?.textContent).toContain('has no price configured');
    expect(root.querySelectorAll('[data-testid="order-basket"] tbody tr').length).toBe(1);
    expect(root.querySelector<HTMLInputElement>('input[name="deliveryAddress"]')!.value).toBe('Rua Entrega, 10');
  });
});
