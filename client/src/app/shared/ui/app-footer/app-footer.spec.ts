import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { CONTACT, CONTACT_INFO, ContactInfo } from '../../../core/contact/contact-info';
import { AppFooter } from './app-footer';

describe('AppFooter contact column', () => {
  beforeEach(() => localStorage.clear());

  function render(contact?: ContactInfo): HTMLElement {
    TestBed.configureTestingModule({
      imports: [AppFooter],
      providers: [provideRouter([]), provideHttpClient(), ...(contact ? [{ provide: CONTACT_INFO, useValue: contact }] : [])],
    });
    const fixture = TestBed.createComponent(AppFooter);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('links to the contact page in the explore list', () => {
    expect(render().querySelector('nav a[href="/contato"]')?.textContent?.trim()).toBe('Contato');
  });

  it('shows the placeholders as plain text, never as links', () => {
    const el = render();

    expect(el.querySelectorAll('[data-testid="placeholder"]').length).toBe(3);
    expect(el.textContent).toContain('(00) 0000-0000');
    expect(el.querySelector('a[href^="tel:"]')).toBeNull();
    expect(el.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(el.querySelector('a[href*="wa.me"]')).toBeNull();
  });

  it('links Facebook and Instagram in a new tab without leaking the opener', () => {
    const links = Array.from(render().querySelectorAll<HTMLAnchorElement>('.footer__social a'));

    expect(links.map((a) => a.getAttribute('href'))).toEqual([CONTACT.facebook, CONTACT.instagram]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('turns real values into tel, WhatsApp and mailto links', () => {
    const el = render({ ...CONTACT, phone: '(11) 3456-7890', whatsapp: '(11) 91234-5678', email: 'vendas@marvi.com.br', address: 'Rua A, 1' });
    const hrefs = Array.from(el.querySelectorAll('.footer__contact a')).map((a) => a.getAttribute('href'));

    expect(hrefs).toEqual(['tel:+551134567890', 'https://wa.me/5511912345678', 'mailto:vendas@marvi.com.br']);
    expect(el.querySelector('[data-testid="placeholder"]')).toBeNull();
    expect(el.textContent).toContain('Rua A, 1');
  });

  it('links to the privacy policy', () => {
    expect(render().querySelector('a[href="/privacidade"]')?.textContent).toContain('Política de Privacidade');
  });
});
