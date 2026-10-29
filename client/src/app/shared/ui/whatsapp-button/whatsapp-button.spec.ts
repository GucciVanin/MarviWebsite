import { TestBed } from '@angular/core/testing';
import { CONTACT, CONTACT_INFO, ContactInfo } from '../../../core/contact/contact-info';
import { WhatsappButton } from './whatsapp-button';

describe('WhatsappButton', () => {
  function render(contact: ContactInfo): HTMLElement {
    TestBed.configureTestingModule({ imports: [WhatsappButton], providers: [{ provide: CONTACT_INFO, useValue: contact }] });
    const fixture = TestBed.createComponent(WhatsappButton);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('is absent while the number is a placeholder', () => {
    expect(render(CONTACT).querySelector('[data-testid="whatsapp-button"]')).toBeNull();
  });

  it('opens a chat with the business once the number is set', () => {
    const link = render({ ...CONTACT, whatsapp: '(11) 91234-5678' }).querySelector<HTMLAnchorElement>('[data-testid="whatsapp-button"]');

    expect(link?.getAttribute('href')).toBe('https://wa.me/5511912345678');
    expect(link?.getAttribute('aria-label')).toBe('Falar no WhatsApp');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
