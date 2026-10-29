import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONTACT, CONTACT_INFO, ContactInfo } from '../../core/contact/contact-info';
import { Privacy } from './privacy';

describe('Privacy policy page', () => {
  function render(contact?: ContactInfo): HTMLElement {
    TestBed.configureTestingModule({
      imports: [Privacy],
      providers: [provideRouter([]), ...(contact ? [{ provide: CONTACT_INFO, useValue: contact }] : [])],
    });
    const fixture = TestBed.createComponent(Privacy);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has a heading for every required section', () => {
    const el = render();
    const headings = Array.from(el.querySelectorAll('h2')).map((h) => h.textContent ?? '');

    for (const expected of ['responsável', 'dados coletamos', 'Para que', 'art. 18', 'dispositivo', 'Terceiros', 'Última atualização']) {
      expect(headings.some((h) => h.includes(expected))).toBe(true);
    }
    expect(el.textContent).toContain('28/10/2026');
  });

  it('shows legal name, CNPJ and contacts as plain placeholder text, never as links', () => {
    const el = render();

    expect(el.textContent).toContain('[CNPJ a informar]');
    expect(el.querySelectorAll('[data-testid="placeholder"]').length).toBeGreaterThanOrEqual(5);
    expect(el.querySelector('a')).toBeNull();
  });

  it('turns real contact values into links', () => {
    const el = render({ ...CONTACT, phone: '(11) 3456-7890', email: 'vendas@marvi.com.br', address: 'Rua A, 1' });

    expect(el.querySelector('a[href="mailto:vendas@marvi.com.br"]')).not.toBeNull();
    expect(el.querySelector('a[href="tel:+551134567890"]')).not.toBeNull();
    expect(el.textContent).toContain('Rua A, 1');
  });
});
