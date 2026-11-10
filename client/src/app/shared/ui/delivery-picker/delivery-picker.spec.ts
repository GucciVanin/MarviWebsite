import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { ClientAddress } from '../../models/client-address.model';
import { address } from '../../models/testing/client-address';
import { DeliveryPicker } from './delivery-picker';

@Component({
  imports: [DeliveryPicker],
  template: `<app-delivery-picker [addresses]="addresses()" [defaultKey]="defaultKey()" [(selectedKey)]="key" [coverage]="coverage()" [addLabel]="addLabel()" (addAddress)="added = added + 1" />`,
})
class Host {
  readonly addresses = signal<ClientAddress[]>([]);
  readonly defaultKey = signal<string | null>(null);
  readonly coverage = signal(true);
  readonly addLabel = signal<string | null>(null);
  key = signal<string | null>(null);
  added = 0;
}

describe('DeliveryPicker (MRV-9.6)', () => {
  const matriz = address({ key: 'k-matriz', label: 'Matriz' });
  const filial = address({ key: 'k-filial', label: 'Filial', kind: 'Delivery', isBilling: false, isDefaultDelivery: false, number: '200', postalCode: '13010000', city: 'Campinas' });
  const cobranca = address({ key: 'k-cobranca', label: 'Só cobrança', kind: 'Billing', isDefaultDelivery: false, isBilling: false, number: '5' });

  function setup(addresses: ClientAddress[], defaultKey: string | null = null) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.addresses.set(addresses);
    fixture.componentInstance.defaultKey.set(defaultKey);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const select = () => root.querySelector<HTMLSelectElement>('[data-testid="delivery-select"]');
    return { fixture, host: fixture.componentInstance, root, settle, select, http: TestBed.inject(HttpTestingController) };
  }

  it('lists only the addresses that can receive goods and preselects the default', async () => {
    const { host, select, settle } = setup([matriz, filial, cobranca], 'k-matriz');
    await settle();

    expect(Array.from(select()!.options).map((o) => o.value)).toEqual(['k-matriz', 'k-filial']);
    expect(host.key()).toBe('k-matriz');
    expect(select()!.value).toBe('k-matriz');
  });

  it('keeps the choice in the two-way model, and falls back to the default when the chosen address disappears', async () => {
    const { host, select, settle } = setup([matriz, filial], 'k-matriz');
    await settle();

    select()!.value = 'k-filial';
    select()!.dispatchEvent(new Event('change'));
    await settle();
    expect(host.key()).toBe('k-filial');

    host.addresses.set([matriz]);
    await settle();
    expect(host.key()).toBe('k-matriz');
  });

  it('asks to choose when several addresses can receive goods and none is the default', async () => {
    const { host, select, root, settle } = setup([matriz, filial], null);
    await settle();

    expect(host.key()).toBeNull();
    expect(select()!.options[0].textContent).toContain('Escolha um endereço');
    expect(root.querySelector('[data-testid="delivery-selected"]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-testid="delivery-coverage"]')!.disabled).toBe(true);
  });

  it('says why there is nothing to choose from, offers the way to add an address when given one, and asks nothing of the coverage service', async () => {
    const { host, root, settle, http, select } = setup([cobranca]);
    host.addLabel.set('Cadastrar endereço');
    await settle();

    expect(select()).toBeNull();
    expect(root.querySelector('[data-testid="delivery-none"]')!.textContent).toContain('Você ainda não tem um endereço de entrega');
    root.querySelector<HTMLButtonElement>('[data-testid="delivery-add"]')!.click();
    expect(host.added).toBe(1);
    http.verify();
  });

  it('can leave out the coverage check and the add link', async () => {
    const { host, root, settle } = setup([matriz], 'k-matriz');
    host.coverage.set(false);
    await settle();

    expect(root.querySelector('[data-testid="delivery-coverage"]')).toBeNull();
    expect(root.querySelector('[data-testid="delivery-add"]')).toBeNull();
  });

  it('asks the coverage service about the chosen address as one line, and shows the answer only for that address', async () => {
    const { host, root, settle, http, select } = setup([matriz, filial], 'k-matriz');
    await settle();

    root.querySelector<HTMLButtonElement>('[data-testid="delivery-coverage"]')!.click();
    const request = http.expectOne('/api/coverage/check');
    expect(request.request.body).toEqual({ address: 'Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000' });
    request.flush({ supported: true, warehouseName: null });
    await settle();
    expect(root.querySelector('[data-testid="delivery-coverage-result"]')!.textContent).toBe('Atendemos este endereço.');

    select()!.value = 'k-filial';
    select()!.dispatchEvent(new Event('change'));
    await settle();
    expect(host.key()).toBe('k-filial');
    expect(root.querySelector('[data-testid="delivery-coverage-result"]')!.textContent).toBe('');
  });

  it('never blocks anything when the coverage check fails: it says so and the choice stays', async () => {
    const { host, root, settle, http } = setup([matriz], 'k-matriz');
    await settle();

    root.querySelector<HTMLButtonElement>('[data-testid="delivery-coverage"]')!.click();
    http.expectOne('/api/coverage/check').flush('x', { status: 429, statusText: 'Too Many Requests' });
    await settle();

    expect(root.querySelector('[data-testid="delivery-coverage-failed"]')!.textContent).toContain('Isso não impede a cotação nem o pedido');
    expect(host.key()).toBe('k-matriz');
    expect(root.querySelector<HTMLButtonElement>('[data-testid="delivery-coverage"]')!.disabled).toBe(false);
  });
});
