import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { fakeToken } from './core/auth/testing/fake-token';
import { App } from './app';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { Contact } from './features/contact/contact';
import { Privacy } from './features/privacy/privacy';
import { Home } from './features/home/home';
import { Storefront } from './features/storefront/storefront';
import { ClientPortal } from './features/client-portal/client-portal';
import { EmployeePortal } from './features/employee-portal/employee-portal';
import { CustomerPage } from './features/employee-portal/customer/customer-page';
import { EmployeeHistory } from './features/employee-portal/history/employee-history';
import { AdminShell } from './features/admin-portal/admin-shell';
import { AdminInbox } from './features/admin-portal/inbox/admin-inbox';
import { AdminPortal } from './features/admin-portal/admin-portal';
import { AdminCatalog } from './features/admin-portal/catalog/admin-catalog';
import { AdminPricing } from './features/admin-portal/pricing/admin-pricing';
import { AdminOperations } from './features/admin-portal/operations/admin-operations';
import { AdminCustomers } from './features/admin-portal/customers/admin-customers';
import { AdminImport } from './features/admin-portal/import/admin-import';
import { AdminAudit } from './features/admin-portal/audit/admin-audit';

/**
 * MRV-9.1 (AC-4): the browser never shows a database id. Every routed page is rendered with API answers whose every id is a GUID, and
 * the DOM is scanned: no GUID may appear in the text or in any attribute (href, title, aria-*, id, ...). The only carriers allowed are
 * the `value` of an <option> or <input> (a form control submits it, nobody reads it) and `data-testid`.
 */

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** A distinct, valid GUID per number, so a leak can be traced to the id that caused it. */
const g = (n: number) => `${String(n).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(n).padStart(12, '0')}`;

/** Where in a rendered tree a GUID shows up: an empty list means the tree is clean. */
function guidsIn(root: HTMLElement): string[] {
  const found: string[] = [];
  const own = (root.textContent ?? '').match(new RegExp(GUID.source, 'gi'));
  if (own) {
    found.push(...own.map((m) => `text: ${m}`));
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    for (const attr of Array.from(el.attributes)) {
      const allowed = attr.name === 'data-testid' || (attr.name === 'value' && (tag === 'option' || tag === 'input'));
      // ng-reflect-* only exists in development builds (Angular mirrors bound inputs there); the real attributes are checked above.
      if (!allowed && !attr.name.startsWith('ng-reflect') && GUID.test(attr.value)) {
        found.push(`<${tag} ${attr.name}="${attr.value}">`);
      }
    }
  }
  return found;
}

// ---- API answers: every id is a GUID, every customer, quote and order has its number

const CUSTOMER = { id: g(1), customerNumber: 42, companyName: 'Bar do Zé' };
const line = (n: number) => ({ id: g(100 + n), productId: g(200 + n), productName: `Produto ${n}`, qty: 2, suggestedUnitPrice: 8.5, finalUnitPrice: 7.5, unitPrice: 7.5 });
const quote = (n: number, status = 'Priced') => ({
  id: g(300 + n), number: 120 + n, clientAccountId: CUSTOMER.id, customerNumber: 42, companyName: CUSTOMER.companyName, status,
  createdAt: '2026-10-02T13:00:00Z', pricedByEmployeeId: g(900), lineItems: [line(1), line(2)],
});
const order = (n: number) => ({
  id: g(400 + n), number: 40 + n, clientAccountId: CUSTOMER.id, customerNumber: 42, companyName: CUSTOMER.companyName, quoteId: g(301), status: 'Placed',
  deliveryAddress: 'Rua Entrega, 10', warehouseId: g(500), placedByEmployeeId: g(901), placedAt: '2026-10-14T13:42:00Z', totalAmount: 30,
  lineItems: [line(1), line(2)],
});
const paged = (items: object[]) => ({ items, page: 1, pageSize: 20, totalCount: items.length });
const product = (n: number) => ({
  id: g(200 + n), sku: `SKU-${n}`, name: `Produto ${n}`, imageUrl: null, attributes: {}, price: 10, dealName: null, inStock: true,
  description: null, categoryId: g(600 + n), isActive: true,
});
const category = (n: number) => ({ id: g(600 + n), name: `Categoria ${n}`, productCount: n, sortOrder: n, isActive: true });
const tier = (n: number) => ({ id: g(700 + n), name: n === 1 ? 'Standard' : 'Ouro', isDefault: n === 1 });
const warehouse = { id: g(500), name: 'CD São Paulo', address: 'Av. Brasil, 1', latitude: -23.5, longitude: -46.6 };
const profile = {
  id: CUSTOMER.id, customerNumber: 42, companyName: CUSTOMER.companyName, createdAt: '2026-10-14T13:42:00Z', billingAddress: 'Rua A, 1',
  shippingAddresses: ['Rua B, 2'], pricingTierName: 'Standard', status: 'Approved', quotes: [quote(1)], orders: [order(1)],
};
const deal = { id: g(1200), name: 'Verão', discountType: 'Percent', discountValue: 10, startDate: '2026-10-01T00:00:00Z', endDate: '2026-12-01T00:00:00Z', productIds: [g(201)], categoryIds: [g(601)], minQty: 1 };
const stock = { id: g(800), productId: g(201), productName: 'Produto 1', warehouseId: g(500), warehouseName: 'CD São Paulo', qtyOnHand: 5, qtyReserved: 1, reorderPoint: 2 };
const auditEntry = (n: number, entityName: string, entityNumber: number | null) => ({
  id: g(1000 + n), actorUserId: g(901), action: 'Update', entityName, entityId: g(1100 + n), entityNumber, timestamp: '2026-10-15T10:19:00Z',
  details: { data: JSON.stringify({ PricingTierId: g(701), PreviousPricingTierId: g(702), Note: `ref ${g(1100 + n)}` }) },
});
const pendingActions = {
  total: 5,
  customers: { count: 1, items: [{ id: g(2), customerNumber: 43, companyName: 'Loja Nova', createdAt: '2026-10-14T13:42:00Z' }] },
  quotes: { count: 1, items: [{ id: g(301), number: 121, clientAccountId: CUSTOMER.id, customerNumber: 42, companyName: CUSTOMER.companyName, createdAt: '2026-10-15T10:00:00Z', lineCount: 3 }] },
  lowStock: { count: 1, items: [{ productId: g(201), sku: 'SKU-1', productName: 'Produto 1', warehouseId: g(500), warehouseName: 'CD São Paulo', available: 4, reorderPoint: 20 }] },
  unpricedProducts: { count: 1, items: [{ productId: g(202), sku: 'SKU-2', name: 'Produto 2' }] },
  unstockedProducts: { count: 0, items: [] },
  contactMessages: { count: 1, items: [{ id: g(3), name: 'Ana', email: 'ana@bar.com.br', phone: null, company: null, message: 'Olá', createdAt: '2026-10-20T09:30:00Z' }] },
};

/** The answer for one request. A request nobody planned for fails the spec, so a new page cannot slip past it unscanned. */
function answer(request: TestRequest): { body: unknown; headers?: Record<string, string> } {
  const url = request.request.url;
  const path = url.split('?')[0];
  const is = (re: RegExp) => re.test(path);
  if (is(/^\/api\/quotes\/mine$/)) return { body: [quote(1), quote(2, 'Submitted')] };
  if (is(/^\/api\/orders\/mine$/)) return { body: [order(1)] };
  if (is(/^\/api\/client\/profile$/)) return { body: profile };
  if (is(/^\/api\/employee\/quotes\/queue$/)) return { body: [quote(1, 'Submitted')] };
  if (is(/^\/api\/employee\/quotes\/history$/)) return { body: paged([quote(1), quote(2, 'Rejected')]) };
  if (is(/^\/api\/employee\/orders\/history$/)) return { body: paged([order(1), order(2)]) };
  if (is(/^\/api\/employee\/orders$/)) return { body: order(3) };
  if (is(/^\/api\/employee\/clients\/by-number\//)) return { body: profile };
  if (is(/^\/api\/employee\/clients\/[0-9a-f-]{36}$/)) return { body: profile };
  if (is(/^\/api\/employee\/clients$/)) {
    return { body: paged([{ ...CUSTOMER, status: 'Approved', pricingTierId: g(701), pricingTierName: 'Standard', createdAt: '2026-10-14T13:42:00Z' }]) };
  }
  if (is(/^\/api\/employee\/inventory$/) || is(/^\/api\/admin\/inventory$/)) return { body: [stock] };
  if (is(/^\/api\/products$/)) return { body: [product(1), product(2)] };
  if (is(/^\/api\/categories$/)) return { body: [category(1), category(2)] };
  if (is(/^\/api\/deals$/) || is(/^\/api\/admin\/deals$/)) return { body: [deal] };
  if (is(/^\/api\/public\/stats$/)) return { body: { productCount: 10, categoryCount: 2, coverageAreaCount: 1 } };
  if (is(/^\/api\/public\/reviews$/)) return { body: null };
  if (is(/^\/api\/admin\/pending-actions$/)) return { body: pendingActions };
  if (is(/^\/api\/admin\/pricing-tiers$/)) return { body: [tier(1), tier(2)] };
  if (is(/^\/api\/admin\/categories$/)) return { body: [category(1), category(2)] };
  if (is(/^\/api\/admin\/products$/)) return { body: [product(1), product(2)] };
  if (is(/^\/api\/admin\/products\/[0-9a-f-]{36}\/pricing$/)) return { body: [{ pricingTierId: g(701), pricingTierName: 'Standard', unitPrice: 10, minQty: 1 }] };
  if (is(/^\/api\/admin\/warehouses$/)) return { body: [warehouse] };
  if (is(/^\/api\/admin\/coverage-areas$/)) return { body: [{ id: g(1300), warehouseId: g(500), type: 'Radius', radiusMiles: 10, polygonGeoJson: null }] };
  if (is(/^\/api\/admin\/audit-log$/)) {
    return {
      body: [auditEntry(1, 'ClientAccount', 42), auditEntry(2, 'Quote', 121), auditEntry(3, 'Order', 41), auditEntry(4, 'Category', null), auditEntry(5, 'Quote', null)],
      headers: { 'X-Total-Count': '5' },
    };
  }
  throw new Error(`The no-ids spec has no answer for ${request.request.method} ${url}; add one so the page it belongs to is scanned.`);
}

/** Answers every request the page makes, and the ones its answers lead to, until it goes quiet. */
async function drain(fixture: ComponentFixture<unknown>, http: HttpTestingController): Promise<void> {
  for (let round = 0; round < 8; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
    const pending = http.match(() => true);
    if (pending.length === 0) {
      return;
    }
    for (const request of pending) {
      if (request.cancelled) {
        continue;
      }
      const { body, headers } = answer(request);
      request.flush(body as object | null, { headers });
    }
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('No internal ids on screen (MRV-9.1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('requestIdleCallback', () => 0);
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  async function render<T>(component: Type<T>, role: string | null = null, route: { number?: string } = {}) {
    if (role) {
      localStorage.setItem('marvi_auth_token', fakeToken(role));
    }
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // A routed page reads its address; the scan renders it for the customer number the page is addressed by.
        ...(route.number ? [{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(route), queryParamMap: convertToParamMap({}) } } }] : []),
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await drain(fixture, http);
    return { fixture, http, root: fixture.nativeElement as HTMLElement };
  }

  // The scanner must see what it is meant to see: a GUID in text or in an attribute other than value / data-testid is reported.
  it('reports a GUID in the text, an href, a title, an aria-label and an id, but not in an option value or a data-testid', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <p>cliente ${g(1)}</p>
      <a href="/x/${g(2)}">l</a><span title="${g(3)}"></span><button aria-label="${g(4)}"></button><strong id="q-${g(5)}"></strong>
      <select><option value="${g(6)}">ok</option></select><input value="${g(7)}"><div data-testid="${g(8)}"></div>`;

    const found = guidsIn(host);

    expect(found.length).toBe(5);
    expect(found.join('\n')).toContain('text:');
    expect(found.join('\n')).toContain('href=');
    expect(found.join('\n')).toContain('title=');
    expect(found.join('\n')).toContain('aria-label=');
    expect(found.join('\n')).toContain('id=');
  });

  describe.each<[string, () => Promise<{ root: HTMLElement }>]>([
    ['the app shell as a visitor', async () => render(App)],
    ['the app shell as a customer', async () => render(App, 'Client')],
    ['the app shell as an employee', async () => render(App, 'Employee')],
    ['the app shell as an admin', async () => render(App, 'Admin')],
    ['the home page', async () => render(Home)],
    ['the login page', async () => render(Login)],
    ['the register page', async () => render(Register)],
    ['the privacy page', async () => render(Privacy)],
    ['the contact page', async () => render(Contact)],
    ['the storefront', async () => render(Storefront)],
    ['the customer portal', async () => render(ClientPortal, 'Client')],
    ['the employee portal', async () => render(EmployeePortal, 'Employee')],
    ['the employee history', async () => render(EmployeeHistory, 'Employee')],
    ['the customer page', async () => render(CustomerPage, 'Employee', { number: 'C-000042' })],
    ['the admin shell', async () => render(AdminShell, 'Admin')],
    ['the admin inbox', async () => render(AdminInbox, 'Admin')],
    ['the admin overview', async () => render(AdminPortal, 'Admin')],
    ['the admin catalog', async () => render(AdminCatalog, 'Admin')],
    ['the admin prices', async () => render(AdminPricing, 'Admin')],
    ['the admin operations', async () => render(AdminOperations, 'Admin')],
    ['the admin customers', async () => render(AdminCustomers, 'Admin')],
    ['the admin import', async () => render(AdminImport, 'Admin')],
    ['the admin audit log', async () => render(AdminAudit, 'Admin')],
  ])('%s', (_name, open) => {
    it('shows no GUID in any text or attribute', async () => {
      const { root } = await open();

      expect(guidsIn(root)).toEqual([]);
    });
  });

  it('shows the pages\' real content, so the scan is not passing on an empty page', async () => {
    const portal = await render(ClientPortal, 'Client');
    expect(portal.root.textContent).toContain('Q-000121');
    expect(portal.root.textContent).toContain('P-000041');
    TestBed.resetTestingModule();

    const audit = await render(AdminAudit, 'Admin');
    const cells = Array.from(audit.root.querySelectorAll('[data-testid="audit-entry"] td:nth-child(3)')).map((c) => c.textContent?.trim());
    expect(cells).toEqual(['Cliente C-000042', 'Cotação Q-000121', 'Pedido P-000041', 'Category', 'Cotação']);
  });

  it('stays clean when a customer is opened and an order is built and placed (employee portal)', async () => {
    const { fixture, http, root } = await render(EmployeePortal, 'Employee');
    const portal = fixture.componentInstance as EmployeePortal;

    // The lookup widget opens first (its pop-up and its page link are scanned too), then the order form works with that customer.
    root.querySelector<HTMLButtonElement>('[data-testid="queue-quote"] button[aria-haspopup="dialog"]')!.click();
    await drain(fixture, http);
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Bar do Zé');
    expect(root.querySelector('[data-testid="open-customer-page"]')?.getAttribute('href')).toBe('/employee/clientes/C-000042');
    expect(guidsIn(root)).toEqual([]);
    portal.addOrderLine(product(1) as never);
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="customer"]')?.textContent).toContain('C-000042');
    expect(guidsIn(root)).toEqual([]);

    (portal as unknown as { deliveryAddress: { set(value: string): void } }).deliveryAddress.set('Rua Entrega, 10');
    portal.placeOrder();
    await drain(fixture, http);

    expect(root.querySelector('[data-testid="placed-order"]')?.textContent).toContain('P-000043');
    expect(guidsIn(root)).toEqual([]);
  });

  it('stays clean when the employee history shows orders and a customer is picked', async () => {
    const { fixture, http, root } = await render(EmployeeHistory, 'Employee');
    const history = fixture.componentInstance as unknown as { setKind(kind: 'quotes' | 'orders'): void; pickClient(match: object): void };

    history.pickClient({ ...CUSTOMER });
    history.setKind('orders');
    await drain(fixture, http);

    expect(root.textContent).toContain('C-000042');
    expect(guidsIn(root)).toEqual([]);
  });

  it('builds a customer-portal basket and a storefront category link without an id in any URL', async () => {
    const portal = await render(ClientPortal, 'Client');
    (portal.fixture.componentInstance as ClientPortal).addToBasket(product(1) as never);
    portal.fixture.detectChanges();
    expect(guidsIn(portal.root)).toEqual([]);
    TestBed.resetTestingModule();

    const home = await render(Home);
    const hrefs = Array.from(home.root.querySelectorAll<HTMLAnchorElement>('[data-testid="category-tile"]')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/storefront?category=Categoria%201', '/storefront?category=Categoria%202']);
    TestBed.resetTestingModule();

    const storefront = await render(Storefront);
    const navigate = TestBed.inject(Router).navigate as unknown as { mock: { calls: unknown[][] } };
    (storefront.fixture.componentInstance as Storefront).pickCategory(g(601));
    await drain(storefront.fixture, storefront.http);
    const calls = navigate.mock.calls.map((c) => JSON.stringify(c[1]));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.join(' ')).not.toMatch(GUID);
    expect(calls.join(' ')).toContain('Categoria 1');
  });
});
