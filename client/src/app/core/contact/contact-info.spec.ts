import { CONTACT, CONTACT_PLACEHOLDER, ContactInfo, contactLinks } from './contact-info';

describe('contactLinks', () => {
  const real: ContactInfo = { ...CONTACT, phone: '(11) 3456-7890', whatsapp: '(11) 91234-5678', email: 'vendas@marvi.com.br' };

  it('makes no link out of the placeholders', () => {
    expect(contactLinks(CONTACT)).toEqual({ phone: null, whatsapp: null, email: null });
  });

  it('builds tel, wa.me and mailto links from real values', () => {
    expect(contactLinks(real)).toEqual({ phone: 'tel:+551134567890', whatsapp: 'https://wa.me/5511912345678', email: 'mailto:vendas@marvi.com.br' });
  });

  it('accepts a number already written with the country code', () => {
    expect(contactLinks({ ...real, whatsapp: '+55 (11) 91234-5678' }).whatsapp).toBe('https://wa.me/5511912345678');
  });

  it('refuses numbers that cannot be dialled and e-mails that are not addresses', () => {
    expect(contactLinks({ ...real, phone: '1234', whatsapp: '(00) 00000-0000x', email: 'not an email' })).toEqual({ phone: null, whatsapp: null, email: null });
  });

  it('keeps the real social profiles', () => {
    expect(CONTACT.facebook).toBe('https://www.facebook.com/marvidistribuidoradebebidas/');
    expect(CONTACT.instagram).toBe('https://www.instagram.com/distribuidoramarvi/');
    expect(CONTACT_PLACEHOLDER.phone).toBe(CONTACT.phone);
  });
});
