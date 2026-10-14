import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminShell } from './admin-shell';

describe('AdminShell', () => {
  it('offers every admin sub-page from one navigation', () => {
    TestBed.configureTestingModule({ imports: [AdminShell], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AdminShell);
    fixture.detectChanges();

    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);

    expect(links).toEqual([
      ['Visão geral', '/admin'],
      ['Catálogo', '/admin/catalogo'],
      ['Preços', '/admin/precos'],
    ]);
  });
});
