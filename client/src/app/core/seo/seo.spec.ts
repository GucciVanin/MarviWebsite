import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Routes, TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { ADMIN_PORTAL_ROUTES } from '../../features/admin-portal/admin-portal.routes';
import { AUTH_ROUTES } from '../../features/auth/auth.routes';
import { CLIENT_PORTAL_ROUTES } from '../../features/client-portal/client-portal.routes';
import { CONTACT_ROUTES } from '../../features/contact/contact.routes';
import { EMPLOYEE_PORTAL_ROUTES } from '../../features/employee-portal/employee-portal.routes';
import { HOME_ROUTES } from '../../features/home/home.routes';
import { PRIVACY_ROUTES } from '../../features/privacy/privacy.routes';
import { STOREFRONT_ROUTES } from '../../features/storefront/storefront.routes';
import { CONTACT, CONTACT_INFO, ContactInfo } from '../contact/contact-info';
import { PT } from '../i18n/pt-br';
import { PageTitleStrategy } from './page-title.strategy';

@Component({ template: '' })
class Blank {}

const testRoutes: Routes = [
  { path: '', pathMatch: 'full', title: PT.seo.titles.home, data: { description: PT.seo.descriptions.home }, component: Blank },
  { path: 'contato', title: PT.seo.titles.contact, data: { description: PT.seo.descriptions.contact }, component: Blank },
  { path: 'admin', title: PT.seo.titles.admin, data: { noindex: true }, children: [{ path: '', title: 'Sub', component: Blank }] },
];

describe('SEO basics (MRV-2.9)', () => {
  function setup(contact?: ContactInfo) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(testRoutes),
        { provide: TitleStrategy, useExisting: PageTitleStrategy },
        ...(contact ? [{ provide: CONTACT_INFO, useValue: contact }] : []),
      ],
    });
    return RouterTestingHarness.create();
  }
  const metaContent = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
  const jsonLd = () => Array.from(document.head.querySelectorAll('script[type="application/ld+json"]'));

  afterEach(() => {
    document.head.querySelectorAll('meta[name="description"], meta[name="robots"], script[type="application/ld+json"]').forEach((e) => e.remove());
  });

  it('titles the home page with the full brand and other pages as "<page> | MARVI"', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/');
    expect(TestBed.inject(Title).getTitle()).toBe('MARVI | Exímia Distribuidora de Bebidas');

    await harness.navigateByUrl('/contato');
    expect(TestBed.inject(Title).getTitle()).toBe('Contato | MARVI');

    await harness.navigateByUrl('/admin');
    expect(TestBed.inject(Title).getTitle()).toBe('Sub | MARVI');
  });

  it('every real route, lazy children included, has a title unless it is an empty-path route inheriting its parent title', () => {
    const lazy: Record<string, Routes> = {
      '': HOME_ROUTES,
      privacidade: PRIVACY_ROUTES,
      contato: CONTACT_ROUTES,
      storefront: STOREFRONT_ROUTES,
      portal: CLIENT_PORTAL_ROUTES,
      employee: EMPLOYEE_PORTAL_ROUTES,
      admin: ADMIN_PORTAL_ROUTES,
    };
    const missing: string[] = [];
    const walk = (list: Routes, trail: string) => {
      for (const r of list) {
        const here = `${trail}/${r.path}`;
        if (r.path !== '' && !(typeof r.title === 'string' && r.title.length > 0)) {
          missing.push(here);
        }
        walk(r.children ?? [], here);
      }
    };
    for (const r of routes) {
      const children = r.pathMatch === 'full' || r.path !== '' ? lazy[r.path ?? ''] : AUTH_ROUTES;
      walk([{ ...r, children }], '');
    }

    expect(missing).toEqual([]);
  });

  it('every public route has a 50 to 160 character description and every private one is noindex', () => {
    const all = [...routes, ...AUTH_ROUTES];
    for (const path of ['', 'storefront', 'contato', 'privacidade', 'login', 'register']) {
      const description = all.find((r) => r.path === path && r.data)?.data?.['description'] as string;
      expect(description.length, path).toBeGreaterThanOrEqual(50);
      expect(description.length, path).toBeLessThanOrEqual(160);
    }
    for (const path of ['portal', 'employee', 'admin', 'login', 'register']) {
      expect(all.find((r) => r.path === path)?.data?.['noindex'], path).toBe(true);
    }
  });

  it('sets the description on public pages and noindex on private ones, and removes it again', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/contato');
    expect(metaContent('description')).toBe(PT.seo.descriptions.contact);
    expect(metaContent('robots')).toBeNull();

    await harness.navigateByUrl('/admin');
    expect(metaContent('robots')).toBe('noindex');
    expect(metaContent('description')).toBeNull();

    await harness.navigateByUrl('/');
    expect(metaContent('robots')).toBeNull();
    expect(metaContent('description')).toBe(PT.seo.descriptions.home);
    expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);
  });

  it('leaves telephone, e-mail and address out of the JSON-LD while they are placeholders', async () => {
    const harness = await setup();

    await harness.navigateByUrl('/');
    const data = JSON.parse(jsonLd()[0].textContent ?? '');

    expect(data['@type']).toBe('LocalBusiness');
    expect(data.name).toBe('MARVI');
    expect(data.url).toBe(window.location.origin);
    expect(data.sameAs).toEqual([CONTACT.facebook, CONTACT.instagram]);
    expect('telephone' in data || 'email' in data || 'address' in data).toBe(false);
  });

  it('includes real contact values and never duplicates the block across navigations', async () => {
    const harness = await setup({ ...CONTACT, phone: '(11) 3456-7890', email: 'vendas@marvi.com.br', address: 'Rua A, 1' });

    await harness.navigateByUrl('/');
    await harness.navigateByUrl('/contato');
    const blocks = jsonLd();
    const data = JSON.parse(blocks[0].textContent ?? '');

    expect(blocks.length).toBe(1);
    expect(data.telephone).toBe('(11) 3456-7890');
    expect(data.email).toBe('vendas@marvi.com.br');
    expect(data.address.streetAddress).toBe('Rua A, 1');
  });

  it('escapes < in the JSON-LD so a value can never close the script element', async () => {
    const harness = await setup({ ...CONTACT, email: 'a@b.co', address: '</script><b>' });

    await harness.navigateByUrl('/');
    const text = jsonLd()[0].textContent ?? '';

    expect(text).not.toContain('<');
    expect(JSON.parse(text).address.streetAddress).toBe('</script><b>');
  });
});
