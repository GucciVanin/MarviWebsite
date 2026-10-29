import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONTACT, CONTACT_INFO, ContactInfo } from '../../core/contact/contact-info';
import { iconNames } from '../../shared/ui/app-icon/testing/icon-names';
import { Contact } from './contact';

describe('Contact page', () => {
  let fixture: ComponentFixture<Contact>;
  let el: HTMLElement;
  let http: HttpTestingController;

  function render(contact?: ContactInfo): void {
    TestBed.configureTestingModule({
      imports: [Contact],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), ...(contact ? [{ provide: CONTACT_INFO, useValue: contact }] : [])],
    });
    fixture = TestBed.createComponent(Contact);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el); // focus only works on attached elements
  }

  async function type(id: string, value: string): Promise<void> {
    await fixture.whenStable(); // ngModel registers its controls in a microtask after the first render
    const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function fill(over: Record<string, string> = {}): Promise<void> {
    const values = { name: '  Ana  ', email: ' ana@exemplo.com ', phone: ' 11 99999-0000 ', company: ' Bar da Ana ', message: '  Gostaria de uma cotação.  ', ...over };
    for (const [field, value] of Object.entries(values)) {
      await type(`contact-${field}`, value);
    }
  }

  async function submit(): Promise<void> {
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const button = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const text = (testId: string) => el.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

  afterEach(() => {
    http.verify();
    el.remove();
  });

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('labels every field', () => {
    render();

    for (const [id, label, autocomplete] of [
      ['contact-name', 'Nome', 'name'],
      ['contact-email', 'E-mail', 'email'],
      ['contact-phone', 'Telefone', 'tel'],
      ['contact-company', 'Empresa', 'organization'],
      ['contact-message', 'Mensagem', 'off'],
    ]) {
      expect(el.querySelector(`label[for="${id}"]`)?.textContent).toContain(label);
      expect(el.querySelector(`#${id}`)?.getAttribute('autocomplete')).toBe(autocomplete);
    }
  });

  it('shows a message per field and sends nothing when the form is empty', async () => {
    render();

    await submit();

    http.expectNone('/api/public/contact');
    expect(text('error-name')).toBe('Informe seu nome.');
    expect(text('error-email')).toBe('Informe seu e-mail.');
    expect(text('error-message')).toBe('Escreva sua mensagem.');
    expect(text('error-phone')).toBeUndefined();
  });

  it('refuses an invalid e-mail, a short message and over-long values', async () => {
    render();
    await fill({ email: 'sem-arroba', message: 'curta', phone: '1'.repeat(31), company: 'x'.repeat(151), name: 'n'.repeat(101) });

    await submit();

    http.expectNone('/api/public/contact');
    expect(text('error-email')).toBe('Informe um e-mail válido.');
    expect(text('error-message')).toBe('A mensagem deve ter pelo menos 10 caracteres.');
    expect(text('error-phone')).toContain('30');
    expect(text('error-company')).toContain('150');
    expect(text('error-name')).toContain('100');
  });

  it('refuses a message over 2000 characters', async () => {
    render();
    await fill({ message: 'a'.repeat(2001) });

    await submit();

    http.expectNone('/api/public/contact');
    expect(text('error-message')).toBe('A mensagem deve ter no máximo 2000 caracteres.');
  });

  it('sends the trimmed values with the empty honeypot, then confirms and clears the form', async () => {
    render();
    await fill();

    await submit();
    const request = http.expectOne('/api/public/contact');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Ana',
      email: 'ana@exemplo.com',
      phone: '11 99999-0000',
      company: 'Bar da Ana',
      message: 'Gostaria de uma cotação.',
      website: '',
    });
    expect(button().disabled).toBe(true);

    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('sent')).toContain('Mensagem enviada');
    expect(button().disabled).toBe(false);
    for (const field of ['name', 'email', 'phone', 'company', 'message']) {
      expect(el.querySelector<HTMLInputElement>(`#contact-${field}`)!.value).toBe('');
    }
  });

  it('swaps the send icon for a spinning loader while the message is in flight, then back', async () => {
    render();
    await fill();
    expect(iconNames(fixture, 'button[type="submit"]')).toEqual(['send']);

    await submit();
    expect(iconNames(fixture, 'button[type="submit"]')).toEqual(['loader']);
    expect(button().querySelector('app-icon')?.classList).toContain('icon-spin');
    http.expectOne('/api/public/contact').flush({}, { status: 202, statusText: 'Accepted' });
    await settle();

    expect(iconNames(fixture, 'button[type="submit"]')).toEqual(['send']);
    expect(button().querySelector('app-icon')?.classList).not.toContain('icon-spin');
  });

  it('does not send a second request while one is in flight', async () => {
    render();
    await fill();

    await submit();
    await submit();

    http.expectOne('/api/public/contact');
  });

  it('maps a 400 with field problems onto the fields', async () => {
    render();
    await fill();
    await submit();

    http.expectOne('/api/public/contact').flush({ title: 'Validation', errors: { email: ['Email is not valid.'], Message: ['x'] } }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('error-email')).toBe('Revise este campo.');
    expect(text('error-message')).toBe('Revise este campo.');
    expect(text('error-name')).toBeUndefined();
    expect(el.querySelector('#contact-failure')?.textContent).toContain('inválidos');
    expect(button().disabled).toBe(false);
  });

  it('explains a 429 and keeps what was typed', async () => {
    render();
    await fill();
    await submit();

    http.expectOne('/api/public/contact').flush(null, { status: 429, statusText: 'Too Many Requests' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Muitas mensagens em pouco tempo. Tente novamente em alguns minutos.');
    expect(el.querySelector<HTMLInputElement>('#contact-name')!.value).toBe('  Ana  ');
    expect(text('sent')).toBeUndefined();
  });

  it('shows the server and network messages for 500 and 0', async () => {
    render();
    await fill();
    await submit();
    http.expectOne('/api/public/contact').flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');

    await submit();
    http.expectOne('/api/public/contact').error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível conectar');
  });

  it('hides the honeypot from people and assistive technology, and sends what a bot puts in it', async () => {
    render();
    const wrapper = el.querySelector('.contact__trap')!;
    const trap = wrapper.querySelector<HTMLInputElement>('input[name="website"]')!;

    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(trap.getAttribute('tabindex')).toBe('-1');
    expect(trap.getAttribute('autocomplete')).toBe('off');

    await fill();
    await type('contact-website', 'http://spam.example');
    await submit();
    expect(http.expectOne('/api/public/contact').request.body.website).toBe('http://spam.example');
  });

  it('detail from the server is never shown on failure', async () => {
    render();
    await fill();
    await submit();

    http.expectOne('/api/public/contact').flush({ title: 'Server secret text', errors: { name: ['x'] } }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(el.querySelector('#contact-failure')?.textContent).not.toContain('Server secret text');
    expect(el.textContent).not.toContain('Server secret text');
  });

  it('announces each field error and links it with aria-describedby only while it exists', async () => {
    render();
    expect(el.querySelector('#contact-name')?.getAttribute('aria-describedby')).toBeNull();

    await submit();

    expect(el.querySelector('[data-testid="error-name"]')?.getAttribute('role')).toBe('alert');
    expect(el.querySelector('#contact-name')?.getAttribute('aria-describedby')).toBe('contact-name-error');
    expect(el.querySelector('#contact-phone')?.getAttribute('aria-describedby')).toBeNull();
  });

  it('focuses the first invalid field on an invalid submit', async () => {
    render();
    await fill({ name: 'Ana', email: 'ruim' });

    await submit();
    await settle();

    expect(document.activeElement?.id).toBe('contact-email');
  });

  it('focuses the confirmation after success', async () => {
    render();
    await fill();
    await submit();

    http.expectOne('/api/public/contact').flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(document.activeElement?.id).toBe('contact-sent');
  });

  it('focuses the error alert after a failed send and the first field after a 400 with fields', async () => {
    render();
    await fill();
    await submit();
    http.expectOne('/api/public/contact').flush(null, { status: 429, statusText: 'Too Many Requests' });
    await settle();
    expect(document.activeElement?.id).toBe('contact-failure');

    await submit();
    http.expectOne('/api/public/contact').flush({ errors: { email: ['x'], message: ['y'] } }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(document.activeElement?.id).toBe('contact-email');
  });

  it('accepts the exact limits', async () => {
    render();
    await fill({ name: 'n'.repeat(100), email: 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(7), phone: '1'.repeat(30), company: 'c'.repeat(150), message: 'm'.repeat(10) });
    await submit();
    http.expectOne('/api/public/contact').flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    await fill({ message: 'm'.repeat(2000) });
    await submit();
    http.expectOne('/api/public/contact').flush(null, { status: 204, statusText: 'No Content' });
  });

  it('refuses one over the limit for each field', async () => {
    render();
    await fill({ name: 'n'.repeat(101), email: 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(8), phone: '1'.repeat(31), company: 'c'.repeat(151), message: 'm'.repeat(9) });
    await submit();

    http.expectNone('/api/public/contact');
    for (const f of ['name', 'email', 'phone', 'company', 'message']) {
      expect(text('error-' + f)).toBeTruthy();
    }
  });

  it('shows the placeholder contact details as plain text, never as links', () => {
    render();

    expect(el.querySelectorAll('[data-testid="placeholder"]').length).toBe(4);
    expect(el.textContent).toContain('(00) 0000-0000');
    expect(el.querySelector('a')).toBeNull();
  });

  it('turns real contact values into links', () => {
    render({ ...CONTACT, phone: '(11) 3456-7890', email: 'vendas@marvi.com.br' });

    expect(el.querySelector('a[href="mailto:vendas@marvi.com.br"]')).not.toBeNull();
    expect(el.querySelector('a[href="tel:+551134567890"]')).not.toBeNull();
  });

  it('sits under a page header with the only h1, and the details are a card like the form (MRV-7.4)', () => {
    render();

    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('header.page-hero h1')).not.toBeNull();
    expect(el.querySelectorAll('.contact__layout > .card').length).toBe(2);
    expect(el.querySelector('.contact__layout .contact__details.card')).not.toBeNull();
  });
});

describe('Contact page icons', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Contact], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Contact);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows a leading icon on each field, and keeps the field ids and labels', () => {
    const { fixture, root } = setup();

    expect(iconNames(fixture, 'form')).toEqual(['user', 'mail', 'phone', 'building', 'message-circle', 'send']);
    for (const id of ['name', 'email', 'phone', 'company', 'message']) {
      expect(root.querySelector(`.field__control > #contact-${id}`)).not.toBeNull();
      expect(root.querySelector(`label[for="contact-${id}"]`)).not.toBeNull();
    }
  });

  it('puts a send icon on the submit button, decorative, with the button text as its name', () => {
    const { fixture, root } = setup();
    const button = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    expect(iconNames(fixture, 'button[type="submit"]')).toEqual(['send']);
    expect(button.textContent?.trim()).toBe('Enviar mensagem');
    expect(button.querySelector('app-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows an alert-circle in each inline validation message', async () => {
    const { fixture, root } = setup();
    await fixture.whenStable();
    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    const messages = Array.from(root.querySelectorAll('small.contact__error'));
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.querySelector('app-icon')).not.toBeNull();
    }
    expect(iconNames(fixture, '[data-testid="error-name"]')).toEqual(['alert-circle']);
  });

  it('labels the contact details with their icons', () => {
    const { fixture } = setup();

    expect(iconNames(fixture, '.contact__details')).toEqual(['phone', 'message-circle', 'mail', 'map-pin']);
  });

});
