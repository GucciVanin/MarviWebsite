import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { address, twoAddresses } from '../../../shared/models/testing/client-address';
import { ClientProfileCard } from './client-profile';

const profile = (over: object = {}) => ({
  id: 'c1', customerNumber: 42, companyName: 'Bar do Zé', ...twoAddresses(), status: 'Approved', createdAt: '2026-10-14T13:42:00Z', ...over,
});

describe('ClientProfileCard', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [ClientProfileCard], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(ClientProfileCard);
    // On the page, so keyboard focus is real (the focus specs read document.activeElement).
    document.body.appendChild(fixture.nativeElement);
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
      const el = field<HTMLInputElement | HTMLSelectElement>(id);
      el.value = value;
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
    };
    const press = (scope: ParentNode, label: string) => {
      const button = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label);
      expect(button, `a button "${label}"`).toBeDefined();
      button!.click();
    };
    const cards = () => Array.from(root.querySelectorAll<HTMLElement>('[data-testid="address"]'));
    return { fixture, http, root, settle, field, type, press, cards };
  }

  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');
  const FILIAL = twoAddresses().addresses[1];

  /** Fills the open form with a valid new address, as a customer would. */
  const fillAddress = (type: (id: string, value: string) => void, prefix: string, over: Record<string, string> = {}) => {
    const values: Record<string, string> = { label: 'Depósito', kind: 'Delivery', cep: '07190100', street: 'Rua do Depósito', number: 's/n', district: 'Cumbica', city: 'Guarulhos', state: 'SP', ...over };
    for (const [part, value] of Object.entries(values)) {
      type(`${prefix}-${part}`, value);
    }
  };

  it('fills the company form and lists the addresses as cards: label, formatted address, badges, no key', async () => {
    const { http, root, settle, field, cards } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    expect(field<HTMLInputElement>('profile-company').value).toBe('Bar do Zé');
    expect(root.querySelector('#profile-billing')).toBeNull();
    expect(root.querySelector('#profile-shipping')).toBeNull();
    const [matriz, filial] = cards().map((c) => (c.textContent ?? '').replace(/\s+/g, ' '));
    expect(matriz).toContain('Matriz');
    expect(matriz).toContain('Principal');
    expect(matriz).toContain('Entrega padrão');
    expect(matriz).toContain('Cobrança e entrega');
    expect(matriz).toContain('Praça da Sé, 10');
    expect(matriz).toContain('Sé, São Paulo/SP, CEP 01001-000');
    expect(filial).toContain('Filial Campinas');
    expect(filial).toContain('Entrega');
    expect(filial).not.toContain('Principal');
    expect(filial).toContain('Rua Barão de Jaguara, 200 - Sala 3');
    expect(filial).toContain('Notas de entrega: Entregar de manhã');
    expect(root.innerHTML).not.toContain('6f1c2a3e');
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

  it('saves only the company name', async () => {
    const { fixture, http, root, settle, type } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    type('profile-company', 'Bar do Zé Ltda');
    await settle();
    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = http.expectOne('/api/client/profile');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ companyName: 'Bar do Zé Ltda' });
    request.flush(profile({ companyName: 'Bar do Zé Ltda' }));
    await settle();

    expect(text(root)).toContain('Dados salvos');
  });

  it('does not offer to save while the company name is empty', async () => {
    const { http, root, settle, type } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();
    const save = () => root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(save().disabled).toBe(false);

    type('profile-company', '   ');
    await settle();
    expect(save().disabled).toBe(true);
  });

  it('does not let the company field change while it is being saved', async () => {
    const { fixture, http, root, settle, field } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(field<HTMLInputElement>('profile-company').readOnly).toBe(true);
    http.expectOne('/api/client/profile').flush(profile());
    await settle();
    expect(field<HTMLInputElement>('profile-company').readOnly).toBe(false);
  });

  it('explains in pt-BR when the server refuses the company name, and keeps what was typed', async () => {
    const { fixture, http, root, settle, field, type } = setup();
    http.expectOne('/api/client/profile').flush(profile());
    await settle();

    type('profile-company', 'Acme');
    await settle();
    root.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectOne('/api/client/profile').flush('Company name is required.', { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('dados enviados são inválidos');
    expect(root.querySelector('[role="alert"] small')?.textContent).toContain('Company name is required');
    expect(field<HTMLInputElement>('profile-company').value).toBe('Acme');
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

  describe('addresses', () => {
    it('adds an address: one labelled field per part, the CEP masked as it is typed, then POST and a fresh list', async () => {
      const { fixture, http, root, settle, field, type, press, cards } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(root, 'Adicionar endereço');
      await settle();
      const form = root.querySelector<HTMLFormElement>('[data-testid="address-form"]')!;
      const labels = Array.from(form.querySelectorAll('label')).map((l) => l.textContent?.trim());
      for (const expected of ['Apelido do endereço', 'Tipo de endereço', 'CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF', 'Notas de entrega']) {
        expect(labels, expected).toContain(expected);
      }
      expect(field<HTMLSelectElement>('address-new-state').options.length).toBe(28); // "Selecione" + the 27 states
      expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);

      type('address-new-cep', '07190a10b0');
      expect(field<HTMLInputElement>('address-new-cep').value).toBe('07190-100');
      fillAddress(type, 'address-new', { cep: '07190100' });
      await settle();
      expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      const request = http.expectOne('/api/client/addresses');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        label: 'Depósito', kind: 'Delivery', postalCode: '07190100', street: 'Rua do Depósito', number: 's/n', complement: null, district: 'Cumbica', city: 'Guarulhos', state: 'SP',
        deliveryNotes: null, isBilling: false, isDefaultDelivery: false,
      });
      request.flush(address({ key: 'k3', label: 'Depósito' }));
      http.expectOne('/api/client/profile').flush(profile({ addresses: [...twoAddresses().addresses, address({ key: 'k3', label: 'Depósito', kind: 'Delivery', isBilling: false, isDefaultDelivery: false })] }));
      await settle();

      expect(cards().length).toBe(3);
      expect(text(root)).toContain('Endereço salvo.');
      expect(root.querySelector('[data-testid="address-form"]')).toBeNull();
    });

    it('asks to make the new address the main one or the default delivery one only when its type allows it', async () => {
      const { http, root, settle, field, type, press } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(root, 'Adicionar endereço');
      await settle();
      expect(root.querySelector('#address-new-billing')).not.toBeNull();
      expect(root.querySelector('#address-new-default')).not.toBeNull();

      type('address-new-kind', 'Delivery');
      await settle();
      expect(root.querySelector('#address-new-billing')).toBeNull();
      expect(root.querySelector('#address-new-default')).not.toBeNull();

      type('address-new-kind', 'Billing');
      await settle();
      expect(root.querySelector('#address-new-billing')).not.toBeNull();
      expect(root.querySelector('#address-new-default')).toBeNull();
      expect(field<HTMLSelectElement>('address-new-kind').value).toBe('Billing');
    });

    it('sends the choice to make an address the main one', async () => {
      const { fixture, http, root, settle, type, press } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(root, 'Adicionar endereço');
      await settle();
      fillAddress(type, 'address-new', { kind: 'Both' });
      const box = root.querySelector<HTMLInputElement>('#address-new-billing')!;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      await settle();
      root.querySelector<HTMLFormElement>('[data-testid="address-form"]')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(http.expectOne('/api/client/addresses').request.body).toMatchObject({ kind: 'Both', isBilling: true, isDefaultDelivery: false });
    });

    it('says the CEP is incomplete before sending, and does not offer to save an incomplete form', async () => {
      const { http, root, settle, type, press } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(root, 'Adicionar endereço');
      await settle();
      fillAddress(type, 'address-new', { cep: '0719' });
      await settle();

      expect(text(root)).toContain('O CEP deve ter 8 dígitos.');
      expect(root.querySelector<HTMLButtonElement>('[data-testid="address-form"] button[type="submit"]')!.disabled).toBe(true);
      type('address-new-state', '');
      type('address-new-cep', '07190100');
      await settle();
      expect(text(root)).not.toContain('O CEP deve ter 8 dígitos.');
      expect(root.querySelector<HTMLButtonElement>('[data-testid="address-form"] button[type="submit"]')!.disabled).toBe(true); // no state yet
    });

    it('refuses a repeated place (same CEP, number and complement, ignoring case and accents) before sending', async () => {
      const { fixture, http, root, settle, type, press } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(root, 'Adicionar endereço');
      await settle();
      fillAddress(type, 'address-new', { cep: '13010-000', number: '200', complement: 'SALA 3' });
      await settle();
      root.querySelector<HTMLFormElement>('[data-testid="address-form"]')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      http.expectNone('/api/client/addresses');
      expect(text(root)).toContain('Já existe um endereço com o mesmo CEP, número e complemento.');
    });

    it('edits an address in place: the form is filled, the CEP masked, and PUT goes to its key', async () => {
      const { fixture, http, root, settle, field, type, press, cards } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(cards()[1], 'Editar');
      await settle();
      expect(field<HTMLInputElement>('address-edit-label').value).toBe('Filial Campinas');
      expect(field<HTMLInputElement>('address-edit-cep').value).toBe('13010-000');
      expect(field<HTMLSelectElement>('address-edit-state').value).toBe('SP');
      expect(field<HTMLSelectElement>('address-edit-kind').value).toBe('Delivery');
      expect(field<HTMLInputElement>('address-edit-notes').value).toBe('Entregar de manhã');
      // Not the main one: the choice is offered.
      expect(root.querySelector('#address-edit-default')).not.toBeNull();

      type('address-edit-label', 'Filial Norte');
      await settle();
      root.querySelector<HTMLFormElement>('form[aria-label="Editar endereço"]')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      const request = http.expectOne(`/api/client/addresses/${FILIAL.key}`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toMatchObject({ label: 'Filial Norte', postalCode: '13010000', number: '200', complement: 'Sala 3', isBilling: false });
      request.flush(address({ key: FILIAL.key, label: 'Filial Norte' }));
      http.expectOne('/api/client/profile').flush(profile());
      await settle();
      expect(root.querySelector('form[aria-label="Editar endereço"]')).toBeNull();
    });

    it('does not offer to make the main address main again', async () => {
      const { http, root, settle, press, cards } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(cards()[0], 'Editar');
      await settle();

      expect(root.querySelector('#address-edit-billing')).toBeNull();
      expect(root.querySelector('#address-edit-default')).toBeNull();
    });

    it('cannot remove the main address or the default delivery one, and says why', async () => {
      const { http, root, settle, cards } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      const [matriz, filial] = cards();
      const removeButton = (card: HTMLElement) => Array.from(card.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Remover')!;
      expect(removeButton(matriz).disabled).toBe(true);
      expect(matriz.textContent).toContain('Este é o endereço principal');
      expect(removeButton(filial).disabled).toBe(false);
    });

    it('removes an address only after a confirming click, then reloads the list', async () => {
      const { http, root, settle, press, cards } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(cards()[1], 'Remover');
      await settle();
      http.expectNone(`/api/client/addresses/${FILIAL.key}`);
      expect(cards()[1].textContent).toContain('Confirmar remoção');

      press(cards()[1], 'Cancelar');
      await settle();
      expect(cards()[1].textContent).not.toContain('Confirmar remoção');

      press(cards()[1], 'Remover');
      await settle();
      press(cards()[1], 'Confirmar remoção');
      const request = http.expectOne(`/api/client/addresses/${FILIAL.key}`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null);
      http.expectOne('/api/client/profile').flush(profile({ addresses: [twoAddresses().addresses[0]] }));
      await settle();

      expect(cards().length).toBe(1);
      expect(text(root)).toContain('Endereço removido.');
    });

    it('shows a refused address in pt-BR with the server reason, and keeps the form and what was typed', async () => {
      const { fixture, http, root, settle, field, type, press } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(root, 'Adicionar endereço');
      await settle();
      fillAddress(type, 'address-new');
      await settle();
      root.querySelector<HTMLFormElement>('[data-testid="address-form"]')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      http.expectOne('/api/client/addresses').flush('Unknown state (UF).', { status: 400, statusText: 'Bad Request' });
      await settle();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain('dados enviados são inválidos');
      expect(root.querySelector('[role="alert"] small')?.textContent).toContain('Unknown state');
      expect(field<HTMLInputElement>('address-new-street').value).toBe('Rua do Depósito');
      expect(root.querySelector('[data-testid="address-form"]')).not.toBeNull();
    });

    it('marks an address that came from the old text and asks the customer to complete it', async () => {
      const { http, root, settle, cards } = setup();
      const legacy = address({ key: 'k9', label: 'Endereço principal', street: 'Rua Velha, 1, Santos', number: '', district: '', city: '', state: '', postalCode: '', needsReview: true });
      http.expectOne('/api/client/profile').flush(profile({ addresses: [legacy], billingAddressKey: 'k9', defaultDeliveryKey: 'k9' }));
      await settle();

      expect(cards()[0].textContent).toContain('Complete este endereço');
      expect(cards()[0].textContent).toContain('Rua Velha, 1, Santos');
      expect(root.querySelectorAll('.badge--warn').length).toBe(1);
    });

    it('stops offering to add at 20 addresses', async () => {
      const { http, root, settle } = setup();
      const many = Array.from({ length: 20 }, (_, i) => address({ key: `k${i}`, label: `Ponto ${i}`, isBilling: i === 0, isDefaultDelivery: i === 0 }));
      http.expectOne('/api/client/profile').flush(profile({ addresses: many, billingAddressKey: 'k0', defaultDeliveryKey: 'k0' }));
      await settle();

      expect(Array.from(root.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Adicionar endereço')).toBe(false);
      expect(text(root)).toContain('No máximo 20 endereços por conta.');
    });

    describe('keyboard focus', () => {
      const focused = () => document.activeElement?.id;

      it('moves focus to the first field when the add form opens, and back to "Adicionar endereço" on cancel', async () => {
        const { http, root, settle, press } = setup();
        http.expectOne('/api/client/profile').flush(profile());
        await settle();

        press(root, 'Adicionar endereço');
        await settle();
        expect(focused()).toBe('address-new-label');

        press(root.querySelector<HTMLElement>('[data-testid="address-form"]')!, 'Cancelar');
        await settle();
        expect(focused()).toBe('address-add-btn');
      });

      it('moves focus into the edit form and back to the "Editar" of that address after cancel and after saving', async () => {
        const { fixture, http, root, settle, press, cards } = setup();
        http.expectOne('/api/client/profile').flush(profile());
        await settle();

        press(cards()[1], 'Editar');
        await settle();
        expect(focused()).toBe('address-edit-label');
        press(root.querySelector<HTMLElement>('form[aria-label="Editar endereço"]')!, 'Cancelar');
        await settle();
        expect(focused()).toBe('address-edit-btn-1');

        press(cards()[1], 'Editar');
        await settle();
        root.querySelector<HTMLFormElement>('form[aria-label="Editar endereço"]')!.dispatchEvent(new Event('submit'));
        fixture.detectChanges();
        http.expectOne(`/api/client/addresses/${FILIAL.key}`).flush(address({ key: FILIAL.key }));
        http.expectOne('/api/client/profile').flush(profile());
        await settle();
        expect(focused()).toBe('address-edit-btn-1');
      });

      it('focuses the confirming button when a removal is asked, back to "Remover" on cancel, and to "Adicionar endereço" once removed', async () => {
        const { http, root, settle, press, cards } = setup();
        http.expectOne('/api/client/profile').flush(profile());
        await settle();

        press(cards()[1], 'Remover');
        await settle();
        expect(focused()).toBe('address-confirm-1');
        press(cards()[1], 'Cancelar');
        await settle();
        expect(focused()).toBe('address-remove-btn-1');

        press(cards()[1], 'Remover');
        await settle();
        press(cards()[1], 'Confirmar remoção');
        http.expectOne(`/api/client/addresses/${FILIAL.key}`).flush(null);
        http.expectOne('/api/client/profile').flush(profile({ addresses: [twoAddresses().addresses[0]] }));
        await settle();
        expect(focused()).toBe('address-add-btn');
        // The success message is announced: its live region exists before the text does.
        expect(root.querySelector('[role="status"] .alert--success')?.textContent).toContain('Endereço removido.');
      });
    });

    it('puts focus on the section heading, not the page body, when the reload after a removal fails', async () => {
      const { http, settle, press, cards } = setup();
      http.expectOne('/api/client/profile').flush(profile());
      await settle();

      press(cards()[1], 'Remover');
      await settle();
      press(cards()[1], 'Confirmar remoção');
      http.expectOne(`/api/client/addresses/${FILIAL.key}`).flush(null);
      http.expectOne('/api/client/profile').flush('boom', { status: 500, statusText: 'Server Error' });
      await settle();

      expect(document.activeElement?.id).toBe('addresses-title');
    });

    it('says there are no addresses yet, and still offers to add one', async () => {
      const { http, root, settle } = setup();
      http.expectOne('/api/client/profile').flush(profile({ addresses: [], billingAddressKey: null, defaultDeliveryKey: null }));
      await settle();

      expect(text(root)).toContain('Nenhum endereço cadastrado ainda.');
      expect(Array.from(root.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Adicionar endereço')).toBe(true);
    });
  });
});
