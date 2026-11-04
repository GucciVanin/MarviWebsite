import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminAudit } from './admin-audit';

const entry = (id: string, action: string, entityName: string, data = '{"Name":"X"}', entityNumber: number | null = null) => ({
  id, actorUserId: 'u1', action, entityName, entityId: 'e1', entityNumber, timestamp: '2026-10-15T10:19:00Z', details: { data },
});

describe('AdminAudit', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [AdminAudit], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminAudit);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const log = () => http.expectOne((r) => r.url === '/api/admin/audit-log');
    return { fixture, http, root, settle, button, log };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('shows the newest entries with what was done, to what, and when', async () => {
    const { root, settle, log } = setup();
    const request = log();
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('25');
    request.flush([entry('a1', 'Import', 'Product', '{"Created":2}'), entry('a2', 'Suspend', 'ClientAccount')], { headers: { 'X-Total-Count': '2' } });
    await settle();

    const rows = Array.from(root.querySelectorAll('[data-testid="audit-entry"]')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(rows.length).toBe(2);
    expect(rows[0]).toContain('Importação');
    expect(rows[0]).toContain('Product');
    expect(rows[0]).toContain('15/10/2026');
    expect(rows[0]).toContain('{"Created":2}');
    expect(rows[1]).toContain('Suspensão');
  });

  // MRV-9.1: the entity column names a customer, quote or order by its number and never shows an id.
  it('names a customer, a quote and an order by their numbers, and any other entity by its name', async () => {
    const { root, settle, log } = setup();
    log().flush(
      [
        entry('a1', 'Approve', 'ClientAccount', '{"Name":"X"}', 42),
        entry('a2', 'Update', 'Quote', '{"Name":"X"}', 123),
        entry('a3', 'Update', 'Order', '{"Name":"X"}', 45),
        entry('a4', 'Create', 'Category', '{"Name":"X"}'),
        entry('a5', 'Update', 'Quote', '{"Name":"X"}', null),
      ],
      { headers: { 'X-Total-Count': '5' } },
    );
    await settle();

    const cells = Array.from(root.querySelectorAll('[data-testid="audit-entry"] td:nth-child(3)')).map((c) => c.textContent?.trim());
    expect(cells).toEqual(['Cliente C-000042', 'Cotação Q-000123', 'Pedido P-000045', 'Category', 'Cotação']);
    expect(text(root)).not.toContain('e1');
  });

  it('leaves ids out of the details, in the text and in the tooltip', async () => {
    const { root, settle, log } = setup();
    const tier = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
    log().flush(
      [
        entry('a1', 'Update', 'ClientAccount', `{"PricingTierId":"${tier}","PreviousPricingTierId":null,"Note":"ok"}`, 42),
        entry('a2', 'Update', 'ClientAccount', `not json ${tier}`, 42),
      ],
      { headers: { 'X-Total-Count': '2' } },
    );
    await settle();

    const details = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="audit-entry"] td:nth-child(4)'));
    expect(details[0].textContent?.trim()).toBe('{"PreviousPricingTierId":null,"Note":"ok"}');
    expect(details[1].textContent?.trim()).toBe('not json …');
    expect(root.innerHTML).not.toContain(tier);
  });

  it('keeps the wide log table inside its own scroll container (MRV-8.4)', async () => {
    const { root, settle, log } = setup();
    log().flush([entry('a1', 'Create', 'Product')], { headers: { 'X-Total-Count': '1' } });
    await settle();

    const table = root.querySelector('table[data-testid="audit"]')!;
    expect(table.parentElement?.classList.contains('table-wrap')).toBe(true);
    expect(table.parentElement?.getAttribute('tabindex')).toBe('0');
    const name = root.querySelector('#' + table.parentElement?.getAttribute('aria-labelledby'));
    expect(name?.textContent).toContain('Registro de auditoria');
  });

  it('pages through the log using the total the API reports', async () => {
    const { root, settle, button, log } = setup();
    log().flush([entry('a1', 'Create', 'Product')], { headers: { 'X-Total-Count': '60' } });
    await settle();

    expect(text(root)).toContain('Página 1 de 3');
    expect(button('Anterior').disabled).toBe(true);

    button('Próxima').click();
    const second = log();
    expect(second.request.params.get('page')).toBe('2');
    second.flush([entry('a2', 'Create', 'Product')], { headers: { 'X-Total-Count': '60' } });
    await settle();
    expect(text(root)).toContain('Página 2 de 3');

    button('Próxima').click();
    log().flush([entry('a3', 'Create', 'Product')], { headers: { 'X-Total-Count': '60' } });
    await settle();
    expect(button('Próxima').disabled).toBe(true);
  });

  it('keeps the pager honest when a page change fails: it still says which page is on screen', async () => {
    const { root, settle, button, log } = setup();
    log().flush([entry('a1', 'Create', 'Product')], { headers: { 'X-Total-Count': '60' } });
    await settle();

    button('Próxima').click();
    log().flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text(root)).toContain('Página 1 de 3');
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('still offers the next page when the API does not report the total (a full page means there may be more)', async () => {
    const { root, settle, button, log } = setup();
    log().flush(Array.from({ length: 25 }, (_, i) => entry(`a${i}`, 'Create', 'Product')));
    await settle();

    expect(button('Próxima').disabled).toBe(false);
    expect(text(root)).toContain('Página 1 de 2');
  });

  it('says so when there is nothing in the log', async () => {
    const { root, settle, log } = setup();
    log().flush([], { headers: { 'X-Total-Count': '0' } });
    await settle();

    expect(text(root)).toContain('Nenhum registro ainda');
    expect(root.querySelector('nav')).toBeNull();
  });

  it('shows a failure to load as an error with a retry, not as an empty log', async () => {
    const { root, settle, log } = setup();
    log().flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(text(root)).not.toContain('Nenhum registro');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    log().flush([entry('a1', 'Delete', 'Category')], { headers: { 'X-Total-Count': '1' } });
    await settle();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root)).toContain('Exclusão');
  });

  it('shows an action it does not know by its own name rather than hiding it', async () => {
    const { root, settle, log } = setup();
    log().flush([entry('a1', 'Teleport', 'Product')], { headers: { 'X-Total-Count': '1' } });
    await settle();

    expect(text(root)).toContain('Teleport');
  });
});
