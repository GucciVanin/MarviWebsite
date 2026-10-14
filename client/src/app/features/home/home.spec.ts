import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { fakeToken } from '../../core/auth/testing/fake-token';
import { Home } from './home';

const category = (n: number) => ({ id: `c${n}`, name: `Categoria ${n}`, productCount: n });

describe('Home (landing page)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function render() {
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const withApi = async (stats: object | 'down', categories: object[] | 'down') => {
      const statsRequest = http.expectOne('/api/public/stats');
      stats === 'down' ? statsRequest.flush('x', { status: 500, statusText: 'Server Error' }) : statsRequest.flush(stats);
      const categoriesRequest = http.expectOne('/api/categories');
      categories === 'down' ? categoriesRequest.flush('x', { status: 500, statusText: 'Server Error' }) : categoriesRequest.flush(categories);
      await settle();
    };
    return { fixture, http, root, settle, withApi };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  // ---- the sections of the design, top to bottom

  it('has every section of the design, each under its own heading', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 16, categoryCount: 6, coverageAreaCount: 3 }, [category(1)]);

    expect(root.querySelector('h1')!.textContent).toContain('Seu abastecimento');
    const headings = Array.from(root.querySelectorAll('h2')).map((h) => h.textContent!.trim());
    expect(headings).toEqual([
      'Uma cadeia fluida. Um abastecimento mais forte.',
      'Por que as empresas confiam na Marvi',
      'As bebidas certas, em um só lugar.',
      'Mantendo negócios abastecidos e em movimento.',
    ]);
  });

  it('offers the section anchors the header links to', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 1, categoryCount: 1, coverageAreaCount: 1 }, []);

    for (const id of ['sobre', 'por-que', 'rede', 'produtos']) {
      expect(root.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it('shows the four steps of the flow', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 1, categoryCount: 1, coverageAreaCount: 1 }, []);

    const steps = Array.from(root.querySelectorAll('[data-testid="flow-step"] h3')).map((h) => h.textContent!.trim());
    expect(steps).toEqual(['Demanda', 'Fornecimento', 'Distribuição', 'Reposição']);
  });

  // ---- live data

  it('shows the live numbers from the API', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 1234, categoryCount: 6, coverageAreaCount: 3 }, []);

    const stats = text(root.querySelector('[data-testid="stats"]') as HTMLElement);
    expect(stats).toContain('1.234');
    expect(stats).toContain('produtos');
    expect(stats).toContain('6 categorias');
    expect(stats).toContain('3 áreas de entrega');
  });

  it('shows up to six category tiles from the API, each linking to that category in the catalog', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 1, categoryCount: 8, coverageAreaCount: 1 }, [1, 2, 3, 4, 5, 6, 7, 8].map(category));

    const tiles = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-testid="category-tile"]'));
    expect(tiles.length).toBe(6);
    expect(tiles[0].textContent).toContain('Categoria 1');
    expect(tiles[0].getAttribute('href')).toBe('/storefront?category=c1');
    expect(tiles[5].getAttribute('href')).toBe('/storefront?category=c6');
  });

  // ---- the API down: no blank areas, no error banners

  it('falls back to static copy for every data-driven area when the API is down', async () => {
    const { root, withApi } = render();
    await withApi('down', 'down');

    const tiles = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-testid="category-tile"]'));
    expect(tiles.map((t) => t.textContent!.trim())).toEqual(
      ['Cervejas', 'Refrigerantes', 'Águas', 'Energéticos', 'Mixers', 'Outras bebidas'].map((name) => expect.stringContaining(name)),
    );
    expect(tiles.every((t) => t.getAttribute('href') === '/storefront')).toBe(true);
    const stats = text(root.querySelector('[data-testid="stats"]') as HTMLElement);
    expect(stats).toContain('Amplo sortimento');
    expect(stats).toContain('Várias regiões');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root)).not.toContain('Erro');
  });

  it('shows the static fallback while the numbers are still loading, never a blank', async () => {
    const { root } = render();

    expect(root.querySelectorAll('[data-testid="category-tile"]').length).toBe(6);
    expect(text(root.querySelector('[data-testid="stats"]') as HTMLElement)).toContain('Várias regiões');
  });

  it('does not boast a count of zero: no coverage areas yet reads as "several regions"', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 10, categoryCount: 2, coverageAreaCount: 0 }, []);

    const stats = text(root.querySelector('[data-testid="stats"]') as HTMLElement);
    expect(stats).toContain('Várias regiões');
    expect(stats).not.toContain('0 áreas');
  });

  // ---- calls to action

  it('sends the visitor to the catalog and invites them to register', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 1, categoryCount: 1, coverageAreaCount: 1 }, []);

    expect(root.querySelector('.hero a[href="/storefront"]')).not.toBeNull();
    expect(root.querySelector('.hero a[href="/register"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="banner"] a[href="/register"]')!.textContent).toContain('Veja como ajudamos');
  });

  it('does not offer registration to a signed-in user', async () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Client'));
    const { root, withApi } = render();
    await withApi({ productCount: 1, categoryCount: 1, coverageAreaCount: 1 }, []);

    expect(root.querySelector('a[href="/register"]')).toBeNull();
    expect(root.querySelector('a[href="/storefront"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="banner"] a')).not.toBeNull();
  });

  // ---- accessibility basics

  it('keeps decorative art out of the accessibility tree and labels every section', async () => {
    const { root, withApi } = render();
    await withApi({ productCount: 1, categoryCount: 1, coverageAreaCount: 1 }, []);

    expect(root.querySelectorAll('svg:not([aria-hidden="true"])').length).toBe(0);
    for (const section of Array.from(root.querySelectorAll('section'))) {
      expect(section.getAttribute('aria-labelledby') ?? section.getAttribute('aria-label'), section.className).toBeTruthy();
    }
  });
});
