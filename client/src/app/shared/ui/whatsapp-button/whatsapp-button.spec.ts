import { TestBed } from '@angular/core/testing';
import { CONTACT, CONTACT_INFO, ContactInfo } from '../../../core/contact/contact-info';
import { PrivacyNoticeState } from '../privacy-notice/privacy-notice-state';
import { iconNames } from '../app-icon/testing/icon-names';
import { WhatsappButton } from './whatsapp-button';

describe('WhatsappButton', () => {
  afterEach(() => localStorage.clear());

  function setup(contact: ContactInfo) {
    TestBed.configureTestingModule({ imports: [WhatsappButton], providers: [{ provide: CONTACT_INFO, useValue: contact }] });
    const fixture = TestBed.createComponent(WhatsappButton);
    fixture.detectChanges();
    return fixture;
  }
  const render = (contact: ContactInfo): HTMLElement => setup(contact).nativeElement as HTMLElement;

  it('is absent while the number is a placeholder', () => {
    expect(render(CONTACT).querySelector('[data-testid="whatsapp-button"]')).toBeNull();
  });

  it('opens a chat with the business once the number is set', () => {
    const link = render({ ...CONTACT, whatsapp: '(11) 91234-5678' }).querySelector<HTMLAnchorElement>('[data-testid="whatsapp-button"]');

    expect(link?.getAttribute('href')).toBe('https://wa.me/5511912345678');
    expect(link?.getAttribute('aria-label')).toBe('Falar no WhatsApp');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('stacks above the privacy notice and returns to its base offset after dismissal', () => {
    const fixture = setup({ ...CONTACT, whatsapp: '(11) 91234-5678' });
    const state = TestBed.inject(PrivacyNoticeState);
    const link = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('[data-testid="whatsapp-button"]')!;
    expect(link().style.bottom).toBe('');

    state.height.set(96);
    fixture.detectChanges();
    expect(link().style.bottom).toContain('96px');

    state.dismiss();
    fixture.detectChanges();
    expect(link().style.bottom).toBe('');
  });
});

describe('WhatsappButton icon', () => {
  afterEach(() => localStorage.clear());

  it('draws the message icon with the app icon, decorative, while the link carries the accessible name', () => {
    TestBed.configureTestingModule({ imports: [WhatsappButton], providers: [{ provide: CONTACT_INFO, useValue: { ...CONTACT, whatsapp: '(11) 91234-5678' } }] });
    const fixture = TestBed.createComponent(WhatsappButton);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="whatsapp-button"]')!;

    expect(iconNames(fixture)).toEqual(['message-circle']);
    expect(link.getAttribute('aria-label')).toBe('Falar no WhatsApp');
    expect(link.querySelector('app-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
