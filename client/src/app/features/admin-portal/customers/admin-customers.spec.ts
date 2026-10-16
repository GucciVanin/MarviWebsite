import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminCustomers } from './admin-customers';

const customer = (id: string, companyName: string, status = 'Approved', tierId: string | null = 't-std') => ({
  id, companyName, status, pricingTierId: tierId, pricingTierName: tierId === 't-gold' ? 'Ouro' : 'Standard',
});
const page = (items: object[], totalCount = items.length) => ({ items, page: 1, pageSize: 20, totalCount });
const tiers = [{ id: 't-std', name: 'Standard', isDefault: true }, { id: 't-gold', name: 'Ouro', isDefault: false }];

describe('AdminCustomers', () => {
  function setup(items: object[] = [customer('c1', 'Bar do Zé'), customer('c2', 'Mercado Sol', 'Suspended', 't-gold')], total?: number) {
    TestBed.configureTestingModule({ imports: [AdminCustomers], providers: [provideHttpClient(), provideHttpClientTesting()] });
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

  it('lists the customers with status and pricing tier, and no credit anywhere', async () => {
    const { root, settle, row } = setup();
    await settle();

    expect(row('Bar do Zé').textContent).toContain('Aprovado');
    expect(row('Bar do Zé').textContent).toContain('Standard');
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

  it('offers Aprovar only for a suspended customer, never for one who is waiting or already approved', async () => {
    const { settle, button, row } = setup([customer('c1', 'Bar do Zé'), customer('c2', 'Mercado Sol', 'Suspended'), customer('c3', 'Loja Nova', 'Pending')]);
    await settle();

    expect(button('Aprovar', row('Mercado Sol'))).toBeDefined();
    expect(button('Aprovar', row('Bar do Zé'))).toBeUndefined();
    expect(button('Aprovar', row('Loja Nova'))).toBeUndefined();
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

  it('approves a suspended customer again, keeping their tier', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();

    button('Aprovar', row('Mercado Sol')).click();
    fixture.detectChanges();

    const request = http.expectOne('/api/admin/clients/c2/approve');
    expect(request.request.body).toEqual({ pricingTierId: 't-gold' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    reload([customer('c1', 'Bar do Zé'), customer('c2', 'Mercado Sol', 'Approved', 't-gold')]);
    await settle();

    expect(text(root)).toContain('Cliente aprovado');
    expect(row('Mercado Sol').textContent).toContain('Aprovado');
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
    TestBed.configureTestingModule({ imports: [AdminCustomers], providers: [provideHttpClient(), provideHttpClientTesting()] });
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
