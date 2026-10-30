import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { fakeToken } from '../../../core/auth/testing/fake-token';
import { iconNames } from '../app-icon/testing/icon-names';
import { AppHeader } from './app-header';

describe('AppHeader', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('links to the catalog and to each section of the landing page', () => {
    const links = Array.from(render().querySelectorAll('.header__links a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);

    expect(links).toEqual([
      ['Início', '/'],
      ['Produtos', '/storefront'],
      ['Nossa Rede', '/#rede'],
      ['Sobre', '/#sobre'],
      ['Por que a Marvi', '/#por-que'],
      ['Contato', '/contato'],
    ]);
  });

  // MRV-8.2: jsdom cannot lay the header out; the layout audit (test/layout) measures it. These pin what the audit relies on.
  it('marks the brand as a logo lockup (judged per text run by the layout audit) and links it home', () => {
    const brand = render().querySelector('a.brand')!;

    expect(brand.hasAttribute('data-lockup')).toBe(true);
    expect(brand.getAttribute('href')).toBe('/');
  });

  it('offers login and registration when signed out', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('Entrar');
    expect(text).toContain('Cadastrar');
    expect(text).not.toContain('Sair');
  });

  it('shows the role area and logout when signed in', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Admin'));
    const element = render();
    const text = element.textContent ?? '';
    expect(text).toContain('Administração');
    expect(text).toContain('Sair');
    expect(text).not.toContain('Cadastrar');
    expect(element.querySelector('a[href="/admin"]')).not.toBeNull();
  });

  it('toggles the mobile menu and reflects it in aria-expanded', () => {
    TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.header__toggle')!;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.header__nav--open')).not.toBeNull();
  });
});

describe('AppHeader icons', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function setup() {
    TestBed.configureTestingModule({ imports: [AppHeader], providers: [provideRouter([]), provideHttpClient()] });
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    return fixture;
  }

  it('puts an icon on every navigation link and keeps the link text', () => {
    const fixture = setup();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.header__links a'));

    expect(links.map((a) => a.querySelector('app-icon') !== null)).toEqual([true, true, true, true, true, true]);
    expect(iconNames(fixture, '.header__links')).toEqual(['home', 'store', 'truck', 'info', 'shield-check', 'mail']);
    expect(links.every((a) => (a.textContent ?? '').trim().length > 0)).toBe(true);
  });

  it('swaps the menu toggle between menu and close icons and keeps its accessible name', () => {
    const fixture = setup();
    const toggle = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.header__toggle')!;

    expect(iconNames(fixture, '.header__toggle')).toEqual(['menu']);
    expect(toggle.textContent?.trim()).toBe('Menu');
    toggle.click();
    fixture.detectChanges();
    expect(iconNames(fixture, '.header__toggle')).toEqual(['x']);
    expect(toggle.textContent?.trim()).toBe('Menu');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('gives login and register their icons when signed out, and the account and logout actions theirs when signed in', () => {
    expect(iconNames(setup(), '.header__actions')).toEqual(['log-in', 'user-plus']);

    TestBed.resetTestingModule();
    localStorage.setItem('marvi_auth_token', fakeToken('Admin'));
    expect(iconNames(setup(), '.header__actions')).toEqual(['user', 'log-out']);
  });

  it('keeps every icon decorative: none carries an accessible name of its own', () => {
    const icons = Array.from((setup().nativeElement as HTMLElement).querySelectorAll('app-icon'));

    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true' && !icon.hasAttribute('aria-label'))).toBe(true);
  });
});

describe('AppHeader menu motion states (MRV-7.3)', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [AppHeader], providers: [provideRouter([]), provideHttpClient()] });
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('adds the open class on the nav while open and removes it when closed, so the slide runs both ways', () => {
    const { fixture, element } = setup();
    const nav = element.querySelector<HTMLElement>('#main-nav')!;
    const toggle = element.querySelector<HTMLButtonElement>('.header__toggle')!;

    expect(nav.classList.contains('header__nav--open')).toBe(false);
    toggle.click();
    fixture.detectChanges();
    expect(nav.classList.contains('header__nav--open')).toBe(true);
    toggle.click();
    fixture.detectChanges();
    expect(nav.classList.contains('header__nav--open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the open menu when a navigation link is chosen', () => {
    const { fixture, element } = setup();
    element.querySelector<HTMLButtonElement>('.header__toggle')!.click();
    fixture.detectChanges();

    element.querySelector<HTMLAnchorElement>('.header__links a')!.click();
    fixture.detectChanges();

    expect(element.querySelector('.header__nav--open')).toBeNull();
  });
});
