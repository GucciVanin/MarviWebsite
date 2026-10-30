import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientProfileCard } from './client-profile';

const profile = (over: object = {}) => ({
  id: 'c1', customerNumber: 42, companyName: 'Bar do Zé', billingAddress: 'Rua A, 1', shippingAddresses: ['Rua B, 2', 'Rua C, 3'], status: 'Approved', createdAt: '2026-10-14T13:42:00Z', ...over,
});

describe('ClientProfileCard', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [ClientProfileCard], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(ClientProfileCard);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const field = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    const type = (id: string, value: string) => {
      const el = field<HTMLInputElement | HTMLTextAreaElement>(id);
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    return { fixture, http, root, settle, field, type };
  }

  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('fills the form with the details the customer has, one shipping address per line', async () => {
    const { http, settle, field } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    expect(field<HTMLInputElement>('profile-company').value).toBe('Bar do Zé');
    expect(field<HTMLInputElement>('profile-billing').value).toBe('Rua A, 1');
    expect(field<HTMLTextAreaElement>('profile-shipping').value).toBe('Rua B, 2\nRua C, 3');
  });

  it('tells the customer their customer number, never an id', async () => {
    const { http, root, settle } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    expect(text(root)).toContain('Número do cliente: C-000042');
    expect(text(root)).not.toContain('c1');
  });

  it('says since when the customer has been registered', async () => {
    const { http, root, settle } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    expect(text(root)).toContain('Cliente desde 14/10/2026');
  });

  it('saves the edited details, sending the shipping lines as a list without blank lines', async () => {
    const { fixture, http, root, settle, field, type } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    type('profile-company', 'Bar do Zé Ltda');
    type('profile-shipping', 'Rua X, 9\n\n  Rua Y, 8  \n');
    await settle();
    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = http.expectOne('/api/client/profile');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ companyName: 'Bar do Zé Ltda', billingAddress: 'Rua A, 1', shippingAddresses: ['Rua X, 9', 'Rua Y, 8'] });
    request.flush(profile({ companyName: 'Bar do Zé Ltda', shippingAddresses: ['Rua X, 9', 'Rua Y, 8'] }));
    await settle();

    expect(text(root)).toContain('Dados salvos');
    expect(field<HTMLTextAreaElement>('profile-shipping').value).toBe('Rua X, 9\nRua Y, 8');
  });

  it('does not offer to save while the company name or the billing address is empty', async () => {
    const { http, root, settle, type } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();
    const save = () => root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(save().disabled).toBe(false);

    type('profile-company', '   ');
    await settle();
    expect(save().disabled).toBe(true);

    type('profile-company', 'Bar');
    type('profile-billing', '');
    await settle();
    expect(save().disabled).toBe(true);
  });

  it('says in pt-BR, before sending anything, when there are too many shipping addresses or one is too long', async () => {
    const { http, root, settle, type } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();
    const save = () => root.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    type('profile-shipping', Array.from({ length: 11 }, (_, i) => `Rua ${i}`).join('\n'));
    await settle();
    expect(text(root)).toContain('No máximo 10 endereços');
    expect(save().disabled).toBe(true);

    type('profile-shipping', 'x'.repeat(501));
    await settle();
    expect(text(root)).toContain('no máximo 500 caracteres');
    expect(save().disabled).toBe(true);

    // Repeats do not count: the server drops them, so ten different addresses plus repeats are fine.
    type('profile-shipping', [...Array.from({ length: 10 }, (_, i) => `Rua ${i}`), 'rua 0'].join('\n'));
    await settle();
    expect(text(root)).not.toContain('No máximo 10 endereços');
    expect(save().disabled).toBe(false);
  });

  it('does not let the fields change while the details are being saved, so a reply cannot overwrite new typing', async () => {
    const { fixture, http, root, settle, field } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(field<HTMLInputElement>('profile-company').readOnly).toBe(true);
    expect(field<HTMLTextAreaElement>('profile-shipping').readOnly).toBe(true);
    http.expectOne('/api/client/profile').flush(profile());
    await settle();
    expect(field<HTMLInputElement>('profile-company').readOnly).toBe(false);
  });

  it('explains in pt-BR when the server refuses the details, and keeps what was typed', async () => {
    const { fixture, http, root, settle, field, type } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    type('profile-shipping', 'Rua 1');
    await settle();
    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectOne('/api/client/profile').flush('At most 10 shipping addresses are allowed.', { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('dados enviados são inválidos');
    expect(root.querySelector('[role="alert"] small')?.textContent).toContain('At most 10');
    expect(field<HTMLTextAreaElement>('profile-shipping').value).toBe('Rua 1');
    expect(text(root)).not.toContain('Dados salvos');
  });

  it('shows a failure to load as an error with a retry, not as an empty form', async () => {
    const { http, root, settle } = setup();
    http.expectOne('/api/client/profile').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.querySelector('form')).toBeNull();

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('form')).not.toBeNull();
  });
});
