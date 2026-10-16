import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminAudit } from './admin-audit';

const entry = (id: string, action: string, entityName: string, data = '{"Name":"X"}') => ({
  id, actorUserId: 'u1', action, entityName, entityId: 'e1', timestamp: '2026-10-15T10:19:00Z', details: { data },
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
