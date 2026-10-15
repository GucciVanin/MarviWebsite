import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientProfileCard } from './client-profile';

const profile = (over: object = {}) => ({
  id: 'c1', companyName: 'Bar do Zé', billingAddress: 'Rua A, 1', shippingAddresses: ['Rua B, 2', 'Rua C, 3'], status: 'Approved', ...over,
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
