import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { EmployeeHistory } from './employee-history';

const line = (name: string, qty: number, suggested: number | null, final: number | null) => ({
  id: `l-${name}`, productId: 'p', productName: name, qty, suggestedUnitPrice: suggested, finalUnitPrice: final,
});
const quote = (id: string, company: string, status: string) => ({
  id, number: Number(id.replace(/\D/g, '')), clientAccountId: 'c-1', customerNumber: 42, companyName: company, status, createdAt: '2026-10-14T13:42:00Z', pricedByEmployeeId: null,
  lineItems: [line('Cola 2L', 3, 9, 7.5)],
});
const order = (id: string, company: string, status = 'Placed') => ({
  id, number: Number(id.replace(/\D/g, '')), clientAccountId: 'c-1', customerNumber: 42, companyName: company, quoteId: null, status, deliveryAddress: 'Rua Entrega, 10', warehouseId: null,
  placedByEmployeeId: null, placedAt: '2026-10-15T10:53:00Z', totalAmount: 22.5,
  lineItems: [{ id: 'ol', productId: 'p', productName: 'Água 500ml', qty: 5, unitPrice: 4.5 }],
});
const page = (items: object[], totalCount = items.length, pageNumber = 1) => ({ items, page: pageNumber, pageSize: 20, totalCount });

describe('EmployeeHistory', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [EmployeeHistory], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(EmployeeHistory);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const set = async (selector: string, value: string, event = 'input') => {
      const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
      el.value = value;
      el.dispatchEvent(new Event(event));
      await settle();
    };
    const quotes = () => http.expectOne((r) => r.url === '/api/employee/quotes/history');
    const orders = () => http.expectOne((r) => r.url === '/api/employee/orders/history');
    return { fixture, http, root, settle, button, set, quotes, orders };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('opens on the quotes history, newest first as the API sends them, with who each quote is for', async () => {
    const { root, settle, quotes } = setup();
    const request = quotes();
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('20');
    request.flush(page([quote('q1', 'Bar do Zé', 'Priced'), quote('q2', 'Mercado Sol', 'Rejected')]));
    await settle();

    const cards = root.querySelectorAll('[data-testid="history-item"]');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Bar do Zé');
    expect(cards[0].textContent).toContain('Preço definido');
    expect(cards[0].textContent).toContain('14/10/2026');
    expect(cards[0].textContent).toContain('Cola 2L');
    expect(cards[1].textContent).toContain('Mercado Sol');
    expect(cards[1].textContent).toContain('Recusada');
  });

  it('keeps every history table in its own scroll box, focusable and uniquely named (MRV-8.5)', async () => {
    const { root, settle, quotes } = setup();
    quotes().flush(page([quote('q1', 'Bar do Zé', 'Priced'), quote('q2', 'Mercado Sol', 'Rejected')]));
    await settle();

    const wraps = Array.from(root.querySelectorAll('table')).map((table) => table.parentElement as HTMLElement);
    expect(wraps.length).toBe(2);
    for (const wrap of wraps) {
      expect(wrap.classList.contains('table-wrap')).toBe(true);
      expect(wrap.getAttribute('tabindex')).toBe('0');
      expect(wrap.getAttribute('role')).toBe('group');
    }
    const names = wraps.map((wrap) => root.querySelector('#' + wrap.getAttribute('aria-labelledby'))?.textContent);
    expect(names).toEqual(['Bar do Zé (C-000042)', 'Mercado Sol (C-000042)']);
  });

  it('switches to the orders history, showing total, delivery address and when it was placed', async () => {
    const { root, settle, button, quotes, orders } = setup();
    quotes().flush(page([]));
    await settle();

    button('Pedidos').click();
    orders().flush(page([order('o1', 'Bar do Zé')]));
    await settle();

    const card = root.querySelector('[data-testid="history-item"]')!;
    expect(card.textContent).toContain('Bar do Zé');
    expect(card.textContent).toContain('Rua Entrega, 10');
    expect(card.textContent).toContain('22,50');
    expect(card.textContent).toContain('15/10/2026');
    expect(card.textContent).toContain('Realizado');
  });

  it('filters by customer, status and date range, always from the first page', async () => {
    const { http, root, settle, button, set, quotes } = setup();
    quotes().flush(page([]));
    await settle();

    await set('input[name="clientSearch"]', 'zé');
    button('Buscar cliente').click();
    http.expectOne((r) => r.url === '/api/employee/clients').flush({ items: [{ id: 'c-9', companyName: 'Bar do Zé', status: 'Approved', pricingTierName: null }], page: 1, pageSize: 10, totalCount: 1 });
    await settle();
    button('Selecionar').click();
    await settle();
    expect(text(root)).toContain('Cliente: Bar do Zé');

    await set('select[name="status"]', 'Rejected', 'change');
    await set('input[name="from"]', '2026-10-01');
    await set('input[name="to"]', '2026-10-15');
    button('Filtrar').click();

    const request = quotes();
    expect(request.request.params.get('clientId')).toBe('c-9');
    expect(request.request.params.get('status')).toBe('Rejected');
    expect(request.request.params.get('from')).toBe(new Date('2026-10-01T00:00:00').toISOString());
    // The last day is included: the API's `to` is exclusive, so it is the start of the next day.
    expect(request.request.params.get('to')).toBe(new Date('2026-10-16T00:00:00').toISOString());
    expect(request.request.params.get('page')).toBe('1');
    request.flush(page([]));
  });

  it('pages through the results and says where it is', async () => {
    const { root, settle, button, quotes } = setup();
    quotes().flush(page([quote('q1', 'Bar', 'Priced')], 45));
    await settle();

    expect(text(root)).toContain('Página 1 de 3');
    expect(button('Anterior').disabled).toBe(true);

    button('Próxima').click();
    const second = quotes();
    expect(second.request.params.get('page')).toBe('2');
    second.flush(page([quote('q2', 'Bar', 'Priced')], 45, 2));
    await settle();
    expect(text(root)).toContain('Página 2 de 3');

    button('Próxima').click();
    quotes().flush(page([quote('q3', 'Bar', 'Priced')], 45, 3));
    await settle();
    expect(button('Próxima').disabled).toBe(true);
  });

  it('keeps the pager honest when a page change fails: it still says which page is on screen', async () => {
    const { root, settle, button, quotes } = setup();
    quotes().flush(page([quote('q1', 'Bar', 'Priced')], 45));
    await settle();

    button('Próxima').click();
    quotes().flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text(root)).toContain('Página 1 de 3');
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('says so when nothing matches, and shows a failure with a retry instead of an empty list', async () => {
    const { root, settle, quotes } = setup();
    quotes().flush(page([]));
    await settle();
    expect(text(root)).toContain('Nada encontrado');

    root.querySelector<HTMLFormElement>('form[data-testid="filters"]')!.dispatchEvent(new Event('submit'));
    quotes().flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    quotes().flush(page([quote('q1', 'Bar do Zé', 'Priced')]));
    await settle();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root)).toContain('Bar do Zé');
  });

  it('clears the filters and starts over', async () => {
    const { root, settle, button, set, quotes } = setup();
    quotes().flush(page([]));
    await settle();
    await set('select[name="status"]', 'Priced', 'change');
    button('Filtrar').click();
    quotes().flush(page([]));
    await settle();

    button('Limpar filtros').click();

    const request = quotes();
    expect(request.request.params.has('status')).toBe(false);
    request.flush(page([]));
    await settle();
    expect(root.querySelector<HTMLSelectElement>('select[name="status"]')!.value).toBe('');
  });
});
