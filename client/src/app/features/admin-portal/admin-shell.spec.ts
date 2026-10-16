import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminShell } from './admin-shell';

describe('AdminShell', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [AdminShell], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminShell);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const links = () => Array.from(root.querySelectorAll('nav a')).map((a) => [a.textContent?.replace(/\s+/g, ' ').trim(), a.getAttribute('href')]);
    return { fixture, http, root, links };
  }

  const inbox = (total: number) => ({
    total,
    customers: { count: total, items: [] }, quotes: { count: 0, items: [] }, lowStock: { count: 0, items: [] }, unpricedProducts: { count: 0, items: [] },
  });

  it('offers every admin sub-page from one navigation, with the inbox first', () => {
    const { http, links } = setup();
    http.expectOne('/api/admin/pending-actions').flush(inbox(0));

    expect(links()).toEqual([
      ['Pendências', '/admin'],
      ['Visão geral', '/admin/visao-geral'],
      ['Catálogo', '/admin/catalogo'],
      ['Preços', '/admin/precos'],
      ['Operação', '/admin/operacao'],
      ['Clientes', '/admin/clientes'],
      ['Importação', '/admin/importacao'],
      ['Auditoria', '/admin/auditoria'],
    ]);
  });

  it('shows how many things are waiting on the Pendências tab, so an admin sees it from any admin page', async () => {
    const { fixture, http, root, links } = setup();
    http.expectOne('/api/admin/pending-actions').flush(inbox(7));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(links()[0]).toEqual(['Pendências 7', '/admin']);
    expect(root.querySelector('nav a[href="/admin"]')!.getAttribute('aria-label')).toBe('Pendências: 7 itens aguardando');
  });

  it('shows no count while it is not known or when nothing is waiting', async () => {
    const { fixture, http, links } = setup();
    expect(links()[0][0]).toBe('Pendências');

    http.expectOne('/api/admin/pending-actions').flush(inbox(0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(links()[0][0]).toBe('Pendências');
  });

  it('keeps working, without a count, when the inbox cannot be loaded', async () => {
    const { fixture, http, links } = setup();

    http.expectOne('/api/admin/pending-actions').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(links()[0][0]).toBe('Pendências');
    expect(links().length).toBe(8);
  });
});
