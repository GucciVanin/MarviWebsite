import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { twoAddresses } from '../../../shared/models/testing/client-address';
import { AdminCustomers } from './admin-customers';

const customer = (id: string, companyName: string, status = 'Approved', tierId: string | null = 't-std') => ({
  id, customerNumber: Number(id.replace(/\D/g, '')) + 41, companyName, status, pricingTierId: tierId, pricingTierName: tierId === 't-gold' ? 'Ouro' : 'Standard', createdAt: '2026-10-14T13:42:00Z',
});
const page = (items: object[], totalCount = items.length) => ({ items, page: 1, pageSize: 20, totalCount });
const tiers = [{ id: 't-std', name: 'Standard', isDefault: true }, { id: 't-gold', name: 'Ouro', isDefault: false }];

describe('AdminCustomers', () => {
  function setup(items: object[] = [customer('c1', 'Bar do Zé'), customer('c2', 'Mercado Sol', 'Suspended', 't-gold')], total?: number) {
    TestBed.configureTestingModule({ imports: [AdminCustomers], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminCustomers);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    http.expectOne((r) => r.url === '/api/employee/clients').flush(page(items, total));
    http.expectOne('/api/admin/pricing-tiers').flush(tiers);
    const button = (label: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const row = (company: string) => Array.from(root.querySelectorAll<HTMLElement>('[data-testid="customer"]')).find((r) => r.textContent?.includes(company))!;
    const set = async (selector: string, value: string, event = 'input') => {
      const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
      el.value = value;
      el.dispatchEvent(new Event(event));
      await settle();
    };
    const reload = (nextItems: object[]) => http.expectOne((r) => r.url === '/api/employee/clients').flush(page(nextItems));
    return { fixture, http, root, settle, button, row, set, reload };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('links each number to the customer page, by number', async () => {
    const { settle, row } = setup();
    await settle();

    expect(row('Bar do Zé').querySelector('a')?.getAttribute('href')).toBe('/employee/clientes/C-000042');
    expect(row('Mercado Sol').querySelector('a')?.getAttribute('href')).toBe('/employee/clientes/C-000043');
  });

  it('lists the customers with status and pricing tier, and no credit anywhere', async () => {
    const { root, settle, row } = setup();
    await settle();

    // The customer is named by customer number, never by id.
    expect(row('Bar do Zé').textContent).toContain('C-000042');
    expect(row('Mercado Sol').textContent).toContain('C-000043');
    expect(text(root)).not.toMatch(/\bc[12]\b/);
    expect(row('Bar do Zé').textContent).toContain('Aprovado');
    expect(row('Bar do Zé').textContent).toContain('Standard');
    expect(row('Bar do Zé').textContent).toContain('14/10/2026');
    expect(text(root)).not.toMatch(/crédito|limite/i);
    expect(row('Mercado Sol').textContent).toContain('Suspenso');
    expect(row('Mercado Sol').textContent).toContain('Ouro');
    expect(text(root)).not.toContain('Refine a busca');
  });

  it('searches by company name', async () => {
    const { fixture, http, root, settle, button, set } = setup();
    await settle();
    await set('input[name="search"]', '  zé ');

    button('Buscar').click();
    fixture.detectChanges();
    const request = http.expectOne((r) => r.url === '/api/employee/clients');
    expect(request.request.params.get('search')).toBe('zé');
    expect(request.request.params.get('pageSize')).toBe('20');
    request.flush(page([customer('c1', 'Bar do Zé')]));
    await settle();

    expect(root.querySelectorAll('[data-testid="customer"]').length).toBe(1);
  });

  it('tells the admin when there are more customers than shown', async () => {
    const { root, settle } = setup([customer('c1', 'Bar 1')], 57);
    await settle();

    expect(text(root)).toContain('Mostrando 1 de 57');
    expect(text(root)).toContain('Refine a busca');
  });

  it('moves a customer to another pricing tier, then shows the new tier', async () => {
    const { fixture, http, root, settle, button, row, set, reload } = setup();
    await settle();

    button('Editar', row('Bar do Zé')).click();
    await settle();
    expect(root.querySelector<HTMLSelectElement>('select[name="tier"]')!.value).toBe('t-std');
    expect(root.querySelector('input[name="credit"]')).toBeNull();
    await set('select[name="tier"]', 't-gold', 'change');
    button('Salvar').click();
    fixture.detectChanges();

    const request = http.expectOne('/api/admin/clients/c1/pricing-tier');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ pricingTierId: 't-gold' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    reload([customer('c1', 'Bar do Zé', 'Approved', 't-gold'), customer('c2', 'Mercado Sol', 'Suspended', 't-gold')]);
    await settle();

    expect(text(root)).toContain('Dados salvos');
    expect(row('Bar do Zé').textContent).toContain('Ouro');
  });

  it('lists the addresses of the customer in the editor and lets an admin fix one, by key (MRV-9.3)', async () => {
    const { fixture, http, root, settle, button, row, set } = setup();
    await settle();

    button('Editar', row('Bar do Zé')).click();
    fixture.detectChanges();
    http.expectOne('/api/employee/clients/c1').flush({ id: 'c1', customerNumber: 42, companyName: 'Bar do Zé', ...twoAddresses(), quotes: [], orders: [] });
    await settle();
    const section = root.querySelector<HTMLElement>('[data-testid="customer-addresses"]')!;
    expect(text(section)).toContain('Matriz');
    expect(text(section)).toContain('Filial Campinas');
    expect(text(section)).toContain('Rua Barão de Jaguara, 200 - Sala 3');
    expect(section.innerHTML).not.toContain('6f1c2a3e');

    const filialCard = Array.from(section.querySelectorAll<HTMLElement>('li')).find((li) => li.textContent?.includes('Filial Campinas'))!;
    button('Corrigir endereço', filialCard).click();
    await settle();
    expect(root.querySelector<HTMLInputElement>('#admin-address-street')!.value).toBe('Rua Barão de Jaguara');
    await set('#admin-address-cep', '13010111');
    expect(root.querySelector<HTMLInputElement>('#admin-address-cep')!.value).toBe('13010-111');
    await set('#admin-address-street', 'Rua Corrigida');
    button('Salvar endereço').click();
    fixture.detectChanges();

    const request = http.expectOne('/api/admin/clients/c1/addresses/6f1c2a3e-0000-4000-8000-0000000000b2');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({ label: 'Filial Campinas', postalCode: '13010111', street: 'Rua Corrigida', number: '200', isBilling: false });
    request.flush({});
    http.expectOne('/api/employee/clients/c1').flush({ id: 'c1', ...twoAddresses(), quotes: [], orders: [] });
    await settle();

    expect(text(root)).toContain('Endereço corrigido.');
    expect(root.querySelector('#admin-address-street')).toBeNull();
  });

  it('moves keyboard focus into the fix form, and back to its button when the admin cancels', async () => {
    const { fixture, http, root, settle, button, row } = setup();
    document.body.appendChild(root);
    await settle();

    button('Editar', row('Bar do Zé')).click();
    fixture.detectChanges();
    http.expectOne('/api/employee/clients/c1').flush({ id: 'c1', ...twoAddresses(), quotes: [], orders: [] });
    await settle();
    const filialCard = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="customer-addresses"] li'))[1];
    button('Corrigir endereço', filialCard).click();
    await settle();
    expect(document.activeElement?.id).toBe('admin-address-label');

    button('Cancelar', root.querySelector<HTMLElement>('form[aria-label="Corrigir endereço"]')!).click();
    await settle();
    expect(document.activeElement?.id).toBe('admin-fix-btn-1');
  });

  it('puts focus on the addresses heading, not the page body, when the reload after a fix fails', async () => {
    const { fixture, http, root, settle, button, row } = setup();
    document.body.appendChild(root);
    await settle();

    button('Editar', row('Bar do Zé')).click();
    fixture.detectChanges();
    http.expectOne('/api/employee/clients/c1').flush({ id: 'c1', ...twoAddresses(), quotes: [], orders: [] });
    await settle();
    const filialCard = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="customer-addresses"] li'))[1];
    button('Corrigir endereço', filialCard).click();
    await settle();
    button('Salvar endereço', root.querySelector<HTMLElement>('form[aria-label="Corrigir endereço"]')!).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c1/addresses/6f1c2a3e-0000-4000-8000-0000000000b2').flush({});
    http.expectOne('/api/employee/clients/c1').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(document.activeElement?.id).toBe('admin-addresses-title');
  });

  it('says so when the customer has no addresses', async () => {
    const { fixture, http, root, settle, button, row } = setup();
    await settle();

    button('Editar', row('Bar do Zé')).click();
    fixture.detectChanges();
    http.expectOne('/api/employee/clients/c1').flush({ id: 'c1', addresses: [], billingAddressKey: null, defaultDeliveryKey: null, quotes: [], orders: [] });
    await settle();

    expect(text(root)).toContain('Este cliente não tem endereços cadastrados.');
  });

  it('suspends an approved customer only after a confirming click', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();

    button('Suspender', row('Bar do Zé')).click();
    await settle();
    http.expectNone('/api/admin/clients/c1/suspend');
    expect(text(root)).toContain('Confirmar suspensão');

    button('Confirmar suspensão').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c1/suspend').flush(null, { status: 204, statusText: 'No Content' });
    reload([customer('c1', 'Bar do Zé', 'Suspended'), customer('c2', 'Mercado Sol', 'Suspended', 't-gold')]);
    await settle();

    expect(text(root)).toContain('Cliente suspenso');
    expect(row('Bar do Zé').textContent).toContain('Suspenso');
  });

  it('lets the admin back out of a suspension', async () => {
    const { fixture, http, root, settle, button, row } = setup();
    await settle();
    button('Suspender', row('Bar do Zé')).click();
    await settle();

    button('Cancelar').click();
    fixture.detectChanges();

    http.expectNone('/api/admin/clients/c1/suspend');
    expect(text(root)).not.toContain('Confirmar suspensão');
    expect(button('Suspender', row('Bar do Zé'))).toBeDefined();
  });

  it('offers Aprovar to every customer who is not approved (pending or suspended), and to nobody else', async () => {
    const { settle, button, row } = setup([customer('c1', 'Bar do Zé'), customer('c2', 'Mercado Sol', 'Suspended'), customer('c3', 'Loja Nova', 'Pending')]);
    await settle();

    expect(button('Aprovar', row('Mercado Sol'))).toBeDefined();
    expect(button('Aprovar', row('Loja Nova'))).toBeDefined();
    expect(button('Aprovar', row('Bar do Zé'))).toBeUndefined();
  });

  it('does not keep showing a refused change after the admin cancels, opens another customer or searches again', async () => {
    const { fixture, http, root, settle, button, row } = setup();
    await settle();
    button('Editar', row('Bar do Zé')).click();
    await settle();
    button('Salvar').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c1/pricing-tier').flush('Unknown pricing tier.', { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(root.querySelector('[role="alert"]')).not.toBeNull();

    button('Cancelar').click();
    await settle();

    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('approves a pending customer only with a pricing tier the admin chose: nothing is preselected', async () => {
    const { fixture, http, root, settle, button, row, set, reload } = setup([customer('c3', 'Loja Nova', 'Pending')]);
    await settle();

    button('Aprovar', row('Loja Nova')).click();
    await settle();
    const select = root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!;
    expect(select.value).toBe('');
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['Escolha a faixa de preço', 'Standard', 'Ouro']);
    expect(button('Confirmar aprovação').disabled).toBe(true);

    await set('select[name="approve-tier"]', 't-gold', 'change');
    expect(button('Confirmar aprovação').disabled).toBe(false);
    button('Confirmar aprovação').click();
    fixture.detectChanges();

    const request = http.expectOne('/api/admin/clients/c3/approve');
    expect(request.request.body).toEqual({ pricingTierId: 't-gold' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    reload([customer('c3', 'Loja Nova', 'Approved', 't-gold')]);
    await settle();

    // A decision here changes what is waiting in the admin inbox, so the inbox (and the count on its tab) is asked again.
    http.expectOne('/api/admin/pending-actions').flush({ total: 0 });
    expect(text(root)).toContain('Cliente aprovado');
    expect(row('Loja Nova').textContent).toContain('Aprovado');
  });

  it('approves a suspended customer again, with their current tier suggested but still confirmed', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();

    button('Aprovar', row('Mercado Sol')).click();
    await settle();
    expect(root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!.value).toBe('t-gold');
    http.expectNone('/api/admin/clients/c2/approve');

    button('Confirmar aprovação').click();
    fixture.detectChanges();
    const request = http.expectOne('/api/admin/clients/c2/approve');
    expect(request.request.body).toEqual({ pricingTierId: 't-gold' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    reload([customer('c1', 'Bar do Zé'), customer('c2', 'Mercado Sol', 'Approved', 't-gold')]);
    await settle();

    expect(row('Mercado Sol').textContent).toContain('Aprovado');
  });

  it('keeps one form open at a time: starting to edit or suspend closes the approval form', async () => {
    const { root, settle, button, row } = setup([customer('c3', 'Loja Nova', 'Pending')]);
    await settle();
    button('Aprovar', row('Loja Nova')).click();
    await settle();
    expect(root.querySelector('select[name="approve-tier"]')).not.toBeNull();

    button('Editar', row('Loja Nova')).click();
    await settle();

    expect(root.querySelector('select[name="approve-tier"]')).toBeNull();
    expect(root.querySelector('select[name="tier"]')).not.toBeNull();
  });

  it('only suggests a tier the list offers: a missing tier leaves the choice empty and the confirmation off', async () => {
    const { root, settle, button, row } = setup([customer('c9', 'Loja Antiga', 'Suspended', 't-gone')]);
    await settle();

    button('Aprovar', row('Loja Antiga')).click();
    await settle();

    expect(root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!.value).toBe('');
    expect(button('Confirmar aprovação').disabled).toBe(true);
  });

  it('lets the admin back out of an approval without sending anything', async () => {
    const { fixture, http, root, settle, button, row } = setup([customer('c3', 'Loja Nova', 'Pending')]);
    await settle();
    button('Aprovar', row('Loja Nova')).click();
    await settle();

    button('Cancelar').click();
    fixture.detectChanges();

    http.expectNone('/api/admin/clients/c3/approve');
    expect(root.querySelector('select[name="approve-tier"]')).toBeNull();
  });

  it('explains a refused change in pt-BR with the server reason', async () => {
    const { fixture, http, root, settle, button, row } = setup();
    await settle();
    button('Editar', row('Bar do Zé')).click();
    await settle();

    button('Salvar').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c1/pricing-tier').flush('Unknown pricing tier.', { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('dados enviados são inválidos');
    expect(root.querySelector('[role="alert"] small')?.textContent).toContain('Unknown pricing tier.');
  });

  it('shows a failed customer list as an error with a retry, not as an empty list', async () => {
    TestBed.configureTestingModule({ imports: [AdminCustomers], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminCustomers);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url === '/api/employee/clients').flush('boom', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/admin/pricing-tiers').flush(tiers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.querySelector('[data-testid="customer"]')).toBeNull();
  });
});
