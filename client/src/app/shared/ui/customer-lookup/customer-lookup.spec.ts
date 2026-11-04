import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import type { ClientProfile } from '../../../features/employee-portal/api/employee.service';
import { twoAddresses } from '../../models/testing/client-address';
import { registration } from '../../models/testing/registration';
import { CustomerLookup, openDocuments } from './customer-lookup';

const profile = (patch: Partial<ClientProfile> = {}): ClientProfile => ({
  id: 'c-123',
  customerNumber: 42,
  companyName: 'Bar do Zé',
  createdAt: '2026-10-14T13:42:00Z',
  ...twoAddresses(),
  pricingTierName: 'Atacado',
  contactEmail: 'ze@bar.example.com',
  registration: registration(),
  status: 'Approved',
  quotes: [
    { id: 'q1', status: 'Submitted' },
    { id: 'q2', status: 'Priced' },
    { id: 'q3', status: 'Accepted' },
  ] as never,
  orders: [
    { id: 'o1', status: 'Placed' },
    { id: 'o2', status: 'Fulfilled' },
  ] as never,
  ...patch,
});

@Component({
  imports: [CustomerLookup],
  template: `
    <button id="elsewhere" type="button">fora</button>
    <app-customer-lookup [number]="number()" label="Consultar cliente" (shown)="shown.push($event)" />
  `,
})
class Host {
  readonly number = signal(42);
  readonly shown: ClientProfile[] = [];
}

/** "label value" per fact, so a spec reads what a person reads. */
const facts = (root: ParentNode) =>
  Array.from(root.querySelectorAll('dt'))
    .map((dt) => `${dt.textContent?.trim()} ${dt.nextElementSibling?.textContent?.trim()}`)
    .join(' | ');

describe('CustomerLookup (the "Consultar cliente" widget)', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Host);
    // Attached to the document so focus is real.
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const trigger = () => root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    const dialog = () => root.querySelector<HTMLElement>('[role="dialog"]');
    const open = async (answer: ClientProfile | null = profile()) => {
      trigger().click();
      fixture.detectChanges();
      if (answer) {
        http.expectOne('/api/employee/clients/by-number/42').flush(answer);
      }
      await settle();
    };
    return { fixture, http, root, settle, trigger, dialog, open };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    document.body.innerHTML = '';
  });

  it('is closed until the button is clicked, and the button announces the dialog', () => {
    const { trigger, dialog } = setup();

    expect(dialog()).toBeNull();
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens next to the button with a labelled non-modal dialog that is busy while the customer loads', async () => {
    const { fixture, http, trigger, dialog, settle } = setup();

    trigger().click();
    fixture.detectChanges();

    const box = dialog()!;
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-modal')).toBeNull();
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.textContent).toContain('Carregando dados do cliente');
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(box.id);
    // The heading names the customer by number until the company name arrives.
    expect(box.querySelector(`#${box.getAttribute('aria-labelledby')}`)?.textContent).toContain('C-000042');

    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();

    expect(box.getAttribute('aria-busy')).toBe('false');
    expect(box.querySelector(`#${box.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('Bar do Zé');
  });

  it('shows the customer\'s information, counts open quotes and orders, and "—" for what is not known', async () => {
    const { dialog, open } = setup();

    await open();

    const shown = facts(dialog()!);
    expect(shown).toContain('Número do cliente C-000042');
    expect(shown).toContain('Situação Aprovado');
    expect(shown).toContain('Cliente desde 14/10/2026');
    expect(shown).toContain('Faixa de preço Atacado');
    expect(shown).toContain('Endereço de cobrança Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000');
    // The other addresses are listed by label (MRV-9.3); no key is rendered.
    expect(shown).toContain('Entrega padrão Matriz: Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000');
    expect(shown).toContain('Outros endereços Filial Campinas: Rua Barão de Jaguara, 200 - Sala 3, Centro, Campinas/SP, CEP 13010-000');
    expect(dialog()!.innerHTML).not.toContain('6f1c2a3e');
    expect(shown).toContain('Cotações em aberto 2');
    expect(shown).toContain('Pedidos em aberto 1');
    // The account type and the document are the customer's (MRV-9.4); the rest: a dash, never an empty row.
    expect(shown).toContain('Tipo de conta Empresa');
    expect(shown).toContain('CNPJ 11.222.333/0001-81 (Matriz)');
    expect(shown).toContain('Cadastro Completo');
    expect(shown).toContain('E-mail de contato ze@bar.example.com');
    expect(dialog()!.querySelectorAll('dd:empty').length).toBe(0);
  });

  it('shows "—" for a customer with no tier and no billing address', async () => {
    const { dialog, open } = setup();

    await open(profile({ pricingTierName: null, addresses: [], billingAddressKey: null, defaultDeliveryKey: null, contactEmail: null }));

    const shown = facts(dialog()!);
    expect(shown).toContain('Faixa de preço —');
    expect(shown).toContain('Endereço de cobrança —');
    expect(shown).toContain('Entrega padrão —'); // a customer migrated without a delivery address: the widget tolerates it (MRV-9.6)
    expect(shown).toContain('E-mail de contato —');
  });

  it('offers a link that opens the customer page in a new tab, by number', async () => {
    const { dialog, open } = setup();

    await open();

    const link = dialog()!.querySelector<HTMLAnchorElement>('[data-testid="open-customer-page"]')!;
    expect(link.getAttribute('href')).toBe('/employee/clientes/C-000042');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent?.trim()).toBe('Abrir página do cliente');
    // Screen readers are told it opens a new tab; the name still starts with the visible text.
    expect(link.getAttribute('aria-label')).toBe('Abrir página do cliente (abre em nova aba)');
    expect(link.outerHTML).not.toContain('c-123');
  });

  it('moves focus into the dialog on open', async () => {
    const { dialog, open } = setup();

    await open();

    expect(document.activeElement).toBe(dialog());
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const { fixture, trigger, dialog, open } = setup();
    await open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes with its close button and gives focus back to the button', async () => {
    const { fixture, trigger, dialog, open } = setup();
    await open();

    Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Fechar')!.click();
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click outside, but not on a click inside, and gives focus back to the button', async () => {
    const { fixture, trigger, dialog, open } = setup();
    await open();

    dialog()!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(dialog()).not.toBeNull();

    document.getElementById('elsewhere')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('after a click outside, leaves focus where the click put it when that is a control', async () => {
    const { fixture, dialog, open } = setup();
    await open();
    const elsewhere = document.getElementById('elsewhere')!;

    elsewhere.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    elsewhere.focus();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('clicking the button again closes it', async () => {
    const { fixture, trigger, dialog, open } = setup();
    await open();

    trigger().click();
    fixture.detectChanges();

    expect(dialog()).toBeNull();
  });

  it('keeps Tab inside the dialog: from the last control to the first, and Shift+Tab the other way', async () => {
    const { dialog, open } = setup();
    await open();
    const stops = Array.from(dialog()!.querySelectorAll<HTMLElement>('a[href], button'));
    const first = stops[0];
    const last = stops[stops.length - 1];
    expect(first.textContent?.trim()).toBe('Fechar');
    expect(last.getAttribute('data-testid')).toBe('open-customer-page');

    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    // Shift+Tab from the dialog itself (where focus lands on open) also wraps to the last control.
    dialog()!.focus();
    const fromPanel = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    dialog()!.dispatchEvent(fromPanel);
    expect(document.activeElement).toBe(last);

    // In the middle of the dialog Tab is left alone.
    first.focus();
    const middle = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    first.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
  });

  it('reuses the loaded customer: opening it a second time asks the API nothing', async () => {
    const { fixture, trigger, dialog, http, open, settle } = setup();
    await open();
    trigger().click();
    fixture.detectChanges();
    expect(dialog()).toBeNull();

    trigger().click();
    fixture.detectChanges();
    await settle();

    http.expectNone('/api/employee/clients/by-number/42');
    expect(dialog()!.textContent).toContain('Bar do Zé');
    expect(dialog()!.getAttribute('aria-busy')).toBe('false');
  });

  it('tells the page which customer it shows each time it opens, from the API and from the session cache', async () => {
    const { fixture, trigger, open, settle } = setup();
    const host = fixture.componentInstance;

    await open();
    trigger().click();
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    await settle();

    expect(host.shown.map((p) => p.customerNumber)).toEqual([42, 42]);
  });

  it('shows a failed load as an alert with a retry button inside the dialog, and retrying loads it', async () => {
    const { fixture, http, trigger, dialog, settle } = setup();
    trigger().click();
    fixture.detectChanges();
    http.expectOne('/api/employee/clients/by-number/42').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    const alert = dialog()!.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Erro no servidor');
    expect(dialog()!.querySelector('[data-testid="lookup-facts"]')).toBeNull();
    const retry = Array.from(alert.querySelectorAll('button')).find((b) => b.textContent?.includes('Tentar novamente'))!;

    retry.click();
    fixture.detectChanges();
    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();

    expect(dialog()!.querySelector('[role="alert"]')).toBeNull();
    expect(dialog()!.textContent).toContain('Bar do Zé');
  });

  it('does not cache a failure: closing and opening again asks the API again', async () => {
    const { fixture, http, trigger, settle } = setup();
    trigger().click();
    fixture.detectChanges();
    http.expectOne('/api/employee/clients/by-number/42').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();
    trigger().click();
    fixture.detectChanges();

    trigger().click();
    fixture.detectChanges();

    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();
  });

  it('ignores an answer that arrives after the widget was closed', async () => {
    const { fixture, http, trigger, dialog, settle } = setup();
    trigger().click();
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();

    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();

    expect(dialog()).toBeNull();
    expect(fixture.componentInstance.shown).toEqual([]);
  });

  it('never puts the customer id on screen', async () => {
    const { root, open } = setup();

    await open();

    expect(root.innerHTML).not.toContain('c-123');
  });
});

describe('openDocuments', () => {
  it('counts quotes waiting for a price or an answer and orders not yet delivered or cancelled', () => {
    expect(openDocuments(profile())).toEqual({ quotes: 2, orders: 1 });
    expect(openDocuments(profile({ quotes: [], orders: [{ status: 'Backordered' }, { status: 'Cancelled' }] as never }))).toEqual({ quotes: 0, orders: 1 });
  });
});
