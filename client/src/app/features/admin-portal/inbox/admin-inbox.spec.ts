import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminInbox } from './admin-inbox';

const group = (items: object[], count = items.length) => ({ count, items });
const inbox = (over: Partial<Record<'customers' | 'quotes' | 'lowStock' | 'unpricedProducts' | 'unstockedProducts', object>> = {}) => {
  const body = {
    customers: group([]), quotes: group([]), lowStock: group([]), unpricedProducts: group([]), unstockedProducts: group([]), ...over,
  } as Record<string, { count: number }>;
  return { total: Object.values(body).reduce((sum, g) => sum + g.count, 0), ...body };
};
const waiting = (id: string, companyName: string) => ({ id, companyName, createdAt: '2026-10-14T13:42:00Z' });
const tiers = [{ id: 't-std', name: 'Standard', isDefault: true }, { id: 't-gold', name: 'Ouro', isDefault: false }];

describe('AdminInbox', () => {
  function setup(first = inbox({ customers: group([waiting('c1', 'Loja Nova'), waiting('c2', 'Bar Novo')]) })) {
    TestBed.configureTestingModule({ imports: [AdminInbox], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminInbox);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pending-actions').flush(first);
    http.expectOne('/api/admin/pricing-tiers').flush(tiers);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const row = (company: string) => Array.from(root.querySelectorAll<HTMLElement>('[data-testid="pending-customer"]')).find((r) => r.textContent?.includes(company))!;
    const reload = (next: ReturnType<typeof inbox>) => http.expectOne('/api/admin/pending-actions').flush(next);
    return { fixture, http, root, settle, button, row, reload };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('lists the customers waiting for a decision, with when they registered', async () => {
    const { root, settle, row } = setup();
    await settle();

    expect(text(root)).toContain('2 itens aguardando');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(2);
    expect(row('Loja Nova').textContent).toContain('14/10/2026');
    expect(text(root)).toContain('Clientes aguardando aprovação');
  });

  it('lists quotes awaiting a price, stock to reorder and products with no price, each with the screen that resolves it', async () => {
    const { root, settle } = setup(inbox({
      quotes: group([{ id: 'q1', clientAccountId: 'c1', companyName: 'Bar do Zé', createdAt: '2026-10-15T10:00:00Z', lineCount: 3 }]),
      lowStock: group([{ productId: 'p1', sku: 'COLA-2L', productName: 'Refrigerante Cola 2L', warehouseId: 'w1', warehouseName: 'CD São Paulo', available: 4, reorderPoint: 20 }]),
      unpricedProducts: group([{ productId: 'p2', sku: 'TONICA', name: 'Água Tônica' }]),
    }));
    await settle();

    const quote = root.querySelector('[data-testid="pending-quote"]')!;
    expect(quote.textContent).toContain('Bar do Zé');
    expect(quote.textContent).toContain('3 itens');
    expect(quote.querySelector('a')!.getAttribute('href')).toBe('/employee');
    const stock = root.querySelector('[data-testid="pending-stock"]')!;
    expect(stock.textContent).toContain('Refrigerante Cola 2L');
    expect(stock.textContent).toContain('CD São Paulo');
    expect(stock.textContent).toContain('4');
    expect(stock.querySelector('a')!.getAttribute('href')).toBe('/admin/operacao');
    const unpriced = root.querySelector('[data-testid="pending-unpriced"]')!;
    expect(unpriced.textContent).toContain('Água Tônica');
    expect(unpriced.querySelector('a')!.getAttribute('href')).toBe('/admin/precos');
  });

  it('lists active products that no warehouse has ever held, with the screen to stock them', async () => {
    const { root, settle } = setup(inbox({ unstockedProducts: group([{ productId: 'p9', sku: 'NOVO-1', name: 'Produto Novo' }]) }));
    await settle();

    const item = root.querySelector('[data-testid="pending-unstocked"]')!;
    expect(item.textContent).toContain('Produto Novo');
    expect(item.querySelector('a')!.getAttribute('href')).toBe('/admin/operacao');
    expect(text(root)).toContain('Produtos ativos sem estoque cadastrado');
  });

  it('takes a decided customer off the list at once, before the refreshed list arrives, so it cannot be decided twice', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();
    button('Suspender', row('Bar Novo')).click();
    await settle();
    button('Confirmar suspensão').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c2/suspend').flush(null, { status: 204, statusText: 'No Content' });
    await settle(); // the refreshed list has not arrived yet

    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
    expect(text(root)).not.toContain('Bar Novo');
    reload(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
  });

  it('says so when the tier list cannot be loaded, instead of offering a form that can never be confirmed', async () => {
    TestBed.configureTestingModule({ imports: [AdminInbox], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminInbox);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pending-actions').flush(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
    http.expectOne('/api/admin/pricing-tiers').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Aprovar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="pending-approval"] [role="alert"]')?.textContent).toContain('Erro no servidor');
  });

  it('closes an open form when a 409 shows the list was stale', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();
    button('Aprovar', row('Loja Nova')).click();
    await settle();
    const select = root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!;
    select.value = 't-std';
    select.dispatchEvent(new Event('change'));
    await settle();

    button('Confirmar aprovação').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c1/approve').flush('This customer is already approved.', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    reload(inbox({ customers: group([waiting('c2', 'Bar Novo')]) }));
    await settle();

    expect(root.querySelector('select[name="approve-tier"]')).toBeNull();
  });

  it('says so, group by group, when nothing is waiting, and celebrates an empty inbox', async () => {
    const { root, settle } = setup(inbox());
    await settle();

    expect(text(root)).toContain('Nada pendente');
    expect(text(root)).toContain('Nenhum cliente aguardando aprovação');
    expect(root.querySelector('[data-testid="pending-customer"]')).toBeNull();
  });

  it('approves a waiting customer only with a tier the admin chose, and the customer leaves the list', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();

    button('Aprovar', row('Loja Nova')).click();
    await settle();
    const select = root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!;
    expect(select.value).toBe('');
    expect(button('Confirmar aprovação').disabled).toBe(true);
    select.value = 't-gold';
    select.dispatchEvent(new Event('change'));
    await settle();
    button('Confirmar aprovação').click();
    fixture.detectChanges();

    const request = http.expectOne('/api/admin/clients/c1/approve');
    expect(request.request.body).toEqual({ pricingTierId: 't-gold' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    reload(inbox({ customers: group([waiting('c2', 'Bar Novo')]) }));
    await settle();

    expect(text(root)).toContain('Cliente aprovado');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
    expect(text(root)).toContain('1 item aguardando');
  });

  it('suspends a waiting customer only after a confirming click', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();

    button('Suspender', row('Bar Novo')).click();
    await settle();
    http.expectNone('/api/admin/clients/c2/suspend');
    expect(text(root)).toContain('Confirmar suspensão');

    button('Confirmar suspensão').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c2/suspend').flush(null, { status: 204, statusText: 'No Content' });
    reload(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
    await settle();

    expect(text(root)).toContain('Cliente suspenso');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
  });

  it('when another admin decided first (a 409), says so and refreshes the list by itself', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();
    button('Suspender', row('Bar Novo')).click();
    await settle();

    button('Confirmar suspensão').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c2/suspend').flush('This customer is already suspended.', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges(); // the effect that refreshes a stale list runs with change detection
    reload(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('conflito');
    expect(root.querySelector('[role="alert"] small')?.textContent).toContain('already suspended');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
  });

  it('says how many there are when more are waiting than are shown', async () => {
    const { root, settle } = setup(inbox({ customers: group([waiting('c1', 'Loja Nova')], 80) }));
    await settle();

    expect(text(root)).toContain('Mostrando 1 de 80');
  });

  it('can be refreshed by hand', async () => {
    const { fixture, root, settle, button, reload } = setup();
    await settle();

    button('Atualizar').click();
    fixture.detectChanges();
    reload(inbox({ customers: group([waiting('c3', 'Mercearia Chegou Agora')]) }));
    await settle();

    expect(text(root)).toContain('Mercearia Chegou Agora');
  });

  it('shows a failure to load as an error with a retry, not as an empty inbox', async () => {
    TestBed.configureTestingModule({ imports: [AdminInbox], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminInbox);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pending-actions').flush('boom', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/admin/pricing-tiers').flush(tiers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(text(root)).not.toContain('Nada pendente');
  });
});
