import { InjectionToken } from '@angular/core';

/** Shown until the owner supplies the real value (MRV-2.6). A value equal to its placeholder is never turned into a link. */
export const CONTACT_PLACEHOLDER = {
  phone: '(00) 0000-0000',
  whatsapp: '(00) 00000-0000',
  email: 'contato@seudominio.com.br',
  address: 'Endereço a informar',
} as const;

export interface ContactInfo {
  readonly phone: string;
  readonly whatsapp: string;
  readonly email: string;
  readonly address: string;
  readonly facebook: string;
  readonly instagram: string;
}

/** The business's contact details: replace the placeholders here, nowhere else. Phones are written as people read them, with the area code. */
export const CONTACT: ContactInfo = {
  phone: CONTACT_PLACEHOLDER.phone,
  whatsapp: CONTACT_PLACEHOLDER.whatsapp,
  email: CONTACT_PLACEHOLDER.email,
  address: CONTACT_PLACEHOLDER.address,
  facebook: 'https://www.facebook.com/marvidistribuidoradebebidas/',
  instagram: 'https://www.instagram.com/distribuidoramarvi/',
};

export const CONTACT_INFO = new InjectionToken<ContactInfo>('CONTACT_INFO', { providedIn: 'root', factory: () => CONTACT });

/** The international digits of a Brazilian number (55 + area code + number), or null when it is not a usable number. */
function brazilianDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (national.length < 10 || national.length > 11 || /^0+$/.test(national)) {
    return null;
  }
  return `55${national}`;
}

/** The link for each contact, or null while it is still a placeholder (the page then shows plain text instead of a dead link). */
export function contactLinks(contact: ContactInfo): { phone: string | null; whatsapp: string | null; email: string | null } {
  const phone = contact.phone === CONTACT_PLACEHOLDER.phone ? null : brazilianDigits(contact.phone);
  const whatsapp = contact.whatsapp === CONTACT_PLACEHOLDER.whatsapp ? null : brazilianDigits(contact.whatsapp);
  const email = contact.email === CONTACT_PLACEHOLDER.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email) ? null : contact.email;
  return {
    phone: phone ? `tel:+${phone}` : null,
    whatsapp: whatsapp ? `https://wa.me/${whatsapp}` : null,
    email: email ? `mailto:${email}` : null,
  };
}
