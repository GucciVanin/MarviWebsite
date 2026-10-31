import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { ClientPortal } from './client-portal';
import { ClientProfileCard } from './profile/client-profile';
import { registration } from '../../shared/models/testing/registration';
import { address, twoAddresses } from '../../shared/models/testing/client-address';

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

// Every quote has a delivery address unless a spec says otherwise (a quote from before MRV-9.6 has none).
const defaultSnapshot = {
  label: 'Matriz', postalCode: '01001000', street: 'Praça da Sé', number: '10', complement: null, district: 'Sé', city: 'São Paulo', state: 'SP', notes: null,
  line: 'Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000',
};

const quote = (id: string, status: string, lines: object[] = []) => ({
  id,
  number: Number(id.replace(/\D/g, '')) + 122,
  clientAccountId: 'c1',
  customerNumber: 42,
  companyName: 'Bar do Zé',
  status,
  createdAt: '2026-10-02T13:00:00Z',
  pricedByEmployeeId: null,
  lineItems: lines,
  deliveryAddressSnapshot: defaultSnapshot as object | null,
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
  /** The customer's addresses (MRV-9.3): a matriz that is billing and default delivery plus a delivery-only branch unless a test says otherwise. */
  profileAddresses?: { addresses: object[]; billingAddressKey: string | null; defaultDeliveryKey: string | null };
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
      request.flush({ id: 'c1', companyName: 'Bar do Zé', ...(data.profileAddresses ?? twoAddresses()), status, createdAt: '2026-10-14T13:42:00Z', registration: registration(), registrationLocked: status !== 'Pending' }),
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
    expect(root.querySelector('#profile-name')).not.toBeNull();
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
    expect(post.request.body).toEqual({ lineItems: [{ productId: '1', qty: 6 }], deliveryAddressKey: twoAddresses().defaultDeliveryKey });
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
    // A quote waiting for its price can only have its address changed; an accepted one has no action at all.
    expect(Array.from(cards[1].querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Alterar endereço de entrega']);
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
      { id: 'o1', number: 45, clientAccountId: 'c1', customerNumber: 42, companyName: 'Bar do Zé', quoteId: 'q1', status: 'Placed', deliveryAddress: '', warehouseId: null, placedByEmployeeId: null, placedAt: '2026-10-14T13:42:00Z', totalAmount: 22,
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
      request.flush({ id: 'c1', companyName: 'Bar', addresses: [], billingAddressKey: null, defaultDeliveryKey: null, status: 'Approved', createdAt: '2026-10-14T13:42:00Z', registration: registration(), registrationLocked: true }),
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

  // ---- MRV-9.6: where the quote is delivered

  const matrizKey = twoAddresses().addresses[0].key;
  const filialKey = twoAddresses().addresses[1].key;

  const snapshot = (label: string, street = 'Praça da Sé', number = '10') => ({
    label, postalCode: '01001000', street, number, complement: null, district: 'Sé', city: 'São Paulo', state: 'SP', notes: null,
    line: `${street}, ${number}, Sé, São Paulo/SP, CEP 01001-000`,
  });

  const choose = (root: HTMLElement, key: string, within: ParentNode = root) => {
    const select = within.querySelector<HTMLSelectElement>('[data-testid="delivery-select"]')!;
    select.value = key;
    select.dispatchEvent(new Event('change'));
  };

  it('offers "Entregar em" with the default delivery address chosen, listing the addresses by label and summary', async () => {
    const { root, settle } = setup();
    await settle();

    const select = root.querySelector<HTMLSelectElement>('[data-testid="basket-delivery"] [data-testid="delivery-select"]')!;
    expect(root.querySelector('[data-testid="basket-delivery"] label')!.textContent).toContain('Entregar em');
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual([
      'Matriz — Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000',
      'Filial Campinas — Rua Barão de Jaguara, 200 - Sala 3, Centro, Campinas/SP, CEP 13010-000',
    ]);
    expect(select.value).toBe(matrizKey);
    const chosen = root.querySelector('[data-testid="basket-delivery"] [data-testid="delivery-selected"]')!;
    expect(chosen.textContent).toContain('Matriz');
    expect(chosen.textContent).toContain('Praça da Sé, 10');
  });

  it('never shows an address key, only labels and addresses', async () => {
    const { root, settle } = setup();
    await settle();

    // The keys are only the option values; neither the text nor any attribute but a value carries one.
    expect(root.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(root.innerHTML.replace(/value="[^"]*"/g, '')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it('sends the quote to the address the customer chose', async () => {
    const { fixture, http, root, settle, button } = setup({ products: [product('1', 'Cola 2L', 12.5)] });
    await settle();
    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();

    choose(root, filialKey);
    await settle();
    expect(root.querySelector('[data-testid="delivery-selected"]')!.textContent).toContain('Filial Campinas');
    button('Solicitar cotação').click();
    fixture.detectChanges();

    expect(http.expectOne('/api/quotes').request.body).toEqual({ lineItems: [{ productId: '1', qty: 1 }], deliveryAddressKey: filialKey });
  });

  it('checks the coverage of the chosen address and shows the answer inline, without blocking the quote', async () => {
    const { fixture, http, root, settle, button } = setup({ products: [product('1', 'Cola 2L', 12.5)] });
    await settle();
    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();

    button('Verificar cobertura').click();
    fixture.detectChanges();
    const check = http.expectOne('/api/coverage/check');
    expect(check.request.body).toEqual({ address: 'Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000' });
    check.flush({ supported: false, warehouseName: null });
    await settle();

    expect(root.querySelector('[data-testid="delivery-coverage-result"]')!.textContent).toContain('fora da nossa área de atendimento');
    expect(button('Solicitar cotação').disabled).toBe(false);
  });

  it('says which depot would serve a covered address', async () => {
    const { fixture, http, root, settle, button } = setup();
    await settle();

    button('Verificar cobertura').click();
    fixture.detectChanges();
    http.expectOne('/api/coverage/check').flush({ supported: true, warehouseName: 'Depósito Centro' });
    await settle();

    expect(root.querySelector('[data-testid="delivery-coverage-result"]')!.textContent).toContain('Depósito Centro');
  });

  it('keeps the quote possible when the coverage check fails', async () => {
    const { fixture, http, root, settle, button } = setup({ products: [product('1', 'Cola 2L', 12.5)] });
    await settle();
    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();

    button('Verificar cobertura').click();
    fixture.detectChanges();
    http.expectOne('/api/coverage/check').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(root.querySelector('[data-testid="delivery-coverage-failed"]')!.textContent).toContain('Não foi possível verificar a cobertura');
    expect(button('Solicitar cotação').disabled).toBe(false);
  });

  it('forgets a coverage answer when another address is chosen', async () => {
    const { fixture, http, root, settle, button } = setup();
    await settle();
    button('Verificar cobertura').click();
    fixture.detectChanges();
    http.expectOne('/api/coverage/check').flush({ supported: true, warehouseName: 'Depósito Centro' });
    await settle();

    choose(root, filialKey);
    await settle();

    expect(root.querySelector('[data-testid="delivery-coverage-result"]')!.textContent).toBe('');
  });

  it('tolerates a customer with no delivery address: says so, links to adding one, and cannot ask for a quote', async () => {
    const { root, settle, button } = setup({ profileAddresses: { addresses: [], billingAddressKey: null, defaultDeliveryKey: null }, products: [product('1', 'Cola 2L', 12.5)] });
    await settle();
    button('Adicionar', root.querySelector('[data-testid="catalog"] tbody tr')!).click();
    await settle();

    expect(root.querySelector('[data-testid="delivery-none"]')!.textContent).toContain('Cadastre um para solicitar uma cotação');
    expect(button('Solicitar cotação').disabled).toBe(true);

    button('Cadastrar ou completar endereço').click();
    await settle();
    expect(root.querySelector('#address-new-label')).not.toBeNull();
  });

  it('a customer with only a billing address has no delivery address to choose from', async () => {
    const billingOnly = address({ kind: 'Billing', isDefaultDelivery: false });
    const { root, settle } = setup({ profileAddresses: { addresses: [billingOnly], billingAddressKey: billingOnly.key, defaultDeliveryKey: null } });
    await settle();

    expect(root.querySelector('[data-testid="delivery-none"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="delivery-select"]')).toBeNull();
  });

  it('with no default flagged, uses the only delivery address, but asks to choose among several', async () => {
    const only = address({ isDefaultDelivery: false });
    const single = setup({ profileAddresses: { addresses: [only], billingAddressKey: only.key, defaultDeliveryKey: null } });
    await single.settle();
    expect(single.root.querySelector<HTMLSelectElement>('[data-testid="delivery-select"]')!.value).toBe(only.key);
    TestBed.resetTestingModule();

    const { addresses } = twoAddresses();
    const several = setup({ profileAddresses: { addresses, billingAddressKey: addresses[0].key, defaultDeliveryKey: null } });
    await several.settle();
    const select = several.root.querySelector<HTMLSelectElement>('[data-testid="delivery-select"]')!;
    expect(select.value).toBe('');
    expect(select.options[0].textContent).toContain('Escolha um endereço');
    expect(several.root.querySelector('[data-testid="delivery-selected"]')).toBeNull();
    expect(several.button('Solicitar cotação').disabled).toBe(true);
  });

  it('marks an address still waiting for review in the list', async () => {
    const legacy = address({ needsReview: true, street: 'Av. Brasil 100', number: '', district: '', city: '', state: '', postalCode: '' });
    const { root, settle } = setup({ profileAddresses: { addresses: [legacy], billingAddressKey: legacy.key, defaultDeliveryKey: legacy.key } });
    await settle();

    expect(root.querySelector<HTMLSelectElement>('[data-testid="delivery-select"]')!.options[0].textContent).toContain('(a completar)');
  });

  it('picks up an address the customer adds below, without reloading the page', async () => {
    const none = setup({ profileAddresses: { addresses: [], billingAddressKey: null, defaultDeliveryKey: null } });
    await none.settle();
    expect(none.root.querySelector('[data-testid="delivery-select"]')).toBeNull();

    const card = none.fixture.debugElement.query(By.directive(ClientProfileCard)).componentInstance as ClientProfileCard;
    const added = address();
    card.addressesChanged.emit({ addresses: [added], billingAddressKey: added.key, defaultDeliveryKey: added.key });
    await none.settle();

    expect(none.root.querySelector<HTMLSelectElement>('[data-testid="delivery-select"]')!.value).toBe(added.key);
  });

  it('shows where each quote is delivered', async () => {
    const { root, settle } = setup({ quotes: [{ ...quote('q1', 'Accepted'), deliveryAddressSnapshot: snapshot('Filial Campinas', 'Rua Barão de Jaguara', '200') }] });
    await settle();

    const block = root.querySelector('[data-testid="quote"] [data-testid="delivery-to"]')!;
    expect(block.textContent).toContain('Entregar em');
    expect(block.textContent).toContain('Filial Campinas');
    expect(block.textContent).toContain('Rua Barão de Jaguara, 200');
  });

  it('lets the customer change the address of a priced quote until it is accepted, with the current one chosen', async () => {
    const { fixture, http, root, settle, button } = setup({
      quotes: [{ ...quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)]), deliveryAddressSnapshot: snapshot('Matriz') }],
    });
    await settle();
    const card = () => root.querySelector('[data-testid="quote"]')!;

    button('Alterar endereço de entrega', card()).click();
    await settle();
    const picker = card().querySelector('[data-testid="quote-change-address"]')!;
    expect(picker.querySelector<HTMLSelectElement>('select')!.value).toBe(matrizKey);
    expect(picker.querySelector('[data-testid="delivery-coverage"]')).toBeNull();

    choose(root, filialKey, picker);
    await settle();
    button('Salvar endereço', card()).click();
    fixture.detectChanges();
    const put = http.expectOne('/api/quotes/123/delivery-address');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ deliveryAddressKey: filialKey });
    put.flush(quote('q1', 'Priced'));
    http.expectOne('/api/quotes/mine').flush([{ ...quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)]), deliveryAddressSnapshot: snapshot('Filial Campinas', 'Rua Barão de Jaguara', '200') }]);
    await settle();

    expect(card().querySelector('[data-testid="quote-change-address"]')).toBeNull();
    expect(card().textContent).toContain('Endereço de entrega atualizado');
    expect(card().textContent).toContain('Filial Campinas');
  });

  it('explains a refused change of address and keeps the picker open', async () => {
    const { fixture, http, root, settle, button } = setup({ quotes: [{ ...quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)]), deliveryAddressSnapshot: snapshot('Matriz') }] });
    await settle();
    button('Alterar endereço de entrega').click();
    await settle();
    choose(root, filialKey);
    await settle();

    button('Salvar endereço').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/123/delivery-address').flush('The delivery address can only change while the quote is Priced', { status: 409, statusText: 'Conflict' });
    await settle();

    expect(root.querySelector('[data-testid="quote-change-address"] [role="alert"]')!.textContent).toContain('entra em conflito');
    expect(button('Salvar endereço')).toBeDefined();
  });

  it('does not accept a priced quote that has no address: says so and opens the address picker instead', async () => {
    const { fixture, http, root, settle, button } = setup({ quotes: [{ ...quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)]), deliveryAddressSnapshot: null }] });
    await settle();

    expect(root.querySelector('[data-testid="quote-needs-address"]')!.textContent).toContain('Escolha o endereço de entrega antes de aceitar o orçamento.');
    button('Aceitar cotação').click();
    await settle();

    http.expectNone('/api/quotes/q1/accept');
    const picker = root.querySelector('[data-testid="quote-change-address"]')!;
    expect(picker.querySelector('select')).not.toBeNull();
    expect(button('Salvar endereço').disabled).toBe(false); // the default address is preselected
    button('Salvar endereço').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/123/delivery-address').flush(quote('q1', 'Priced'));
    http.expectOne('/api/quotes/mine').flush([quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)])]);
    await settle();

    expect(root.querySelector('[data-testid="quote-needs-address"]')).toBeNull();
    button('Aceitar cotação').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/q1/accept').flush({});
    http.expectOne('/api/quotes/mine').flush([]);
    http.expectOne('/api/orders/mine').flush([]);
  });

  it('shows the server\'s refusal when a stale view accepts a quote that has no address', async () => {
    const { fixture, http, root, settle, button } = setup({ quotes: [quote('q1', 'Priced', [line('Cola 2L', 1, 12.5, 11)])] });
    await settle();

    button('Aceitar cotação').click();
    fixture.detectChanges();
    http.expectOne('/api/quotes/q1/accept').flush('Escolha o endereço de entrega antes de aceitar o orçamento.', { status: 409, statusText: 'Conflict' });
    await settle();

    expect(root.querySelector('[role="alert"] small')?.textContent).toContain('Escolha o endereço de entrega antes de aceitar o orçamento.');
  });

  it('tells the customer the address is sent to a map provider when checking coverage', async () => {
    const { root, settle } = setup();
    await settle();

    expect(root.querySelector('[data-testid="basket-delivery"] [data-testid="delivery-coverage-notice"]')!.textContent).toContain('enviado a um provedor de mapas');
  });

  it('lets the customer back out of changing the address', async () => {
    const { fixture, http, root, settle, button } = setup({ quotes: [quote('q1', 'Submitted', [line('Cola 2L', 1, 12.5, null)])] });
    await settle();
    button('Alterar endereço de entrega').click();
    await settle();

    button('Cancelar', root.querySelector('[data-testid="quote-change-address"]')!).click();
    fixture.detectChanges();

    http.expectNone('/api/quotes/123/delivery-address');
    expect(root.querySelector('[data-testid="quote-change-address"]')).toBeNull();
  });

  it('offers no change of address for an accepted, rejected or expired quote', async () => {
    const { root, settle } = setup({ quotes: [quote('q1', 'Accepted'), quote('q2', 'Rejected'), quote('q3', 'Expired')] });
    await settle();

    expect(root.textContent).not.toContain('Alterar endereço de entrega');
  });

  // ---- my orders

  it('shows each order with its lines, total and status', async () => {
    const { root, settle } = setup({
      orders: [
        { id: 'o1', number: 45, clientAccountId: 'c1', customerNumber: 42, companyName: 'Bar do Zé', quoteId: 'q1', status: 'Fulfilled', deliveryAddress: 'Rua A, 10', warehouseId: null, placedByEmployeeId: null, placedAt: '2026-10-14T13:42:00Z', totalAmount: 1234.5,
          lineItems: [{ id: 'ol1', productId: 'p1', productName: 'Cola 2L', qty: 2, unitPrice: 617.25 }] },
      ],
    });
    await settle();

    const card = root.querySelector('[data-testid="order"]')!;
    expect(card.textContent).toContain('Pedido P-000045');
    expect(card.textContent).not.toContain('o1');
    expect(card.textContent).toContain('Entregue');
    expect(card.textContent).toContain('Rua A, 10');
    expect(card.textContent).toContain('Realizado em 14/10/2026');
    expect(card.textContent).toContain('Cola 2L');
    expect(card.textContent).toContain('1.234,50');
  });

  it('shows the delivery address of an order as it was chosen, and the old text of an order made before addresses were structured', async () => {
    const order = (id: string, number: number, deliveryAddress: string, deliveryAddressSnapshot: object | null) => ({
      id, number, clientAccountId: 'c1', customerNumber: 42, companyName: 'Bar do Zé', quoteId: null, status: 'Placed', deliveryAddress, deliveryAddressSnapshot,
      warehouseId: null, placedByEmployeeId: null, placedAt: '2026-10-14T13:42:00Z', totalAmount: 10, lineItems: [],
    });
    const { root, settle } = setup({
      orders: [
        order('o1', 45, 'Rua B, 200', { ...snapshot('Filial Campinas', 'Rua B', '200'), notes: 'Entregar de manhã' }),
        order('o2', 46, 'Rua Antiga, 5, Campinas', null),
        order('o3', 47, '', null),
      ],
    });
    await settle();

    const blocks = Array.from(root.querySelectorAll('[data-testid="order"] [data-testid="delivery-to"]')).map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(blocks[0]).toContain('Filial Campinas');
    expect(blocks[0]).toContain('Rua B, 200');
    expect(blocks[0]).toContain('Notas de entrega: Entregar de manhã');
    expect(blocks[1]).toContain('Rua Antiga, 5, Campinas');
    expect(blocks[2]).toContain('Endereço a confirmar');
  });

  it('keeps each table in its own scroll box, focusable and named by its card (MRV-8.5)', async () => {
    const { root, settle } = setup({
      quotes: [quote('q1', 'Priced', [line('Cola 2L', 6, 12.5, 11)])],
      orders: [{ id: 'o1', number: 45, clientAccountId: 'c1', customerNumber: 42, companyName: 'Bar do Zé', quoteId: 'q1', status: 'Fulfilled', deliveryAddress: 'Rua A, 10', warehouseId: null, placedByEmployeeId: null, placedAt: '2026-10-14T13:42:00Z', totalAmount: 10,
        lineItems: [{ id: 'ol1', productId: 'p1', productName: 'Cola 2L', qty: 1, unitPrice: 10 }] }],
    });
    await settle();

    const tables = Array.from(root.querySelectorAll('table'));
    expect(tables.length).toBe(2);
    for (const table of tables) {
      const wrap = table.parentElement as HTMLElement;
      expect(wrap.classList.contains('table-wrap')).toBe(true);
      expect(wrap.getAttribute('tabindex')).toBe('0');
      expect(wrap.getAttribute('role')).toBe('group');
      expect(root.querySelector('#' + wrap.getAttribute('aria-labelledby'))).not.toBeNull();
    }
    // Two different cards, two different names (a unique id each).
    expect(new Set(tables.map((t) => t.parentElement!.getAttribute('aria-labelledby'))).size).toBe(2);
  });

  it('says so when there are no orders yet', async () => {
    const { root, settle } = setup();
    await settle();

    expect(text(root)).toContain('Nenhum pedido ainda');
  });
});
