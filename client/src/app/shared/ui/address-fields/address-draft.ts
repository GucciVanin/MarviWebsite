import { computed, signal } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import type { ClientAddress, ClientAddressKind, ClientAddressRequest } from '../../models/client-address.model';
import { BRAZIL_STATES, maskPostalCode } from '../../format/address';

/** The server's limits (ClientAddressRules), checked here too so the customer is told in pt-BR before anything is sent. */
export const ADDRESS_LIMITS = { label: 60, street: 200, number: 20, complement: 100, district: 100, city: 100, notes: 300 } as const;

/**
 * The text being typed into an address form (MRV-9.3). Signals, not plain fields: the app is zoneless, so only signal writes re-render.
 * The fields component edits it, and its parent (registration, profile, admin) reads `request()` when the form is submitted.
 */
export class AddressDraft {
  readonly label = signal('');
  readonly kind = signal<ClientAddressKind>('Both');
  readonly postalCode = signal('');
  readonly street = signal('');
  readonly number = signal('');
  readonly complement = signal('');
  readonly district = signal('');
  readonly city = signal('');
  readonly state = signal('');
  readonly deliveryNotes = signal('');
  readonly makeBilling = signal(false);
  readonly makeDefault = signal(false);

  /** Registration has no label or type fields: the address is the first one, labelled and typed by the server. */
  constructor(private readonly compact = false) {}

  /** The first thing wrong with what is typed, in pt-BR, or null. An empty required field is not shown as a problem while typing: see `complete`. */
  readonly problem = computed<string | null>(() => {
    const digits = this.postalCode().replace(/\D/g, '');
    return digits.length > 0 && digits.length !== 8 ? PT.address.invalidPostalCode : null;
  });

  /** Every required part is filled in (the label too, unless compact) and the CEP is whole. */
  readonly complete = computed(
    () =>
      (this.compact || this.label().trim() !== '') &&
      this.postalCode().replace(/\D/g, '').length === 8 &&
      this.street().trim() !== '' &&
      this.number().trim() !== '' &&
      this.district().trim() !== '' &&
      this.city().trim() !== '' &&
      BRAZIL_STATES.some((s) => s.uf === this.state()),
  );

  readonly canSubmit = computed(() => this.complete() && this.problem() === null);

  load(address: ClientAddress): void {
    this.label.set(address.label);
    this.kind.set(address.kind);
    this.postalCode.set(maskPostalCode(address.postalCode));
    this.street.set(address.street);
    this.number.set(address.number);
    this.complement.set(address.complement ?? '');
    this.district.set(address.district);
    this.city.set(address.city);
    this.state.set(address.state);
    this.deliveryNotes.set(address.deliveryNotes ?? '');
    this.makeBilling.set(false);
    this.makeDefault.set(false);
  }

  reset(): void {
    for (const field of [this.label, this.postalCode, this.street, this.number, this.complement, this.district, this.city, this.state, this.deliveryNotes]) {
      field.set('');
    }
    this.kind.set('Both');
    this.makeBilling.set(false);
    this.makeDefault.set(false);
  }

  /** What is typed, trimmed, as the API wants it. Registration sends no label or type (the server uses "Endereço principal" and Both). */
  request(): ClientAddressRequest {
    const optional = (text: string) => (text.trim() === '' ? null : text.trim());
    return {
      label: this.compact ? null : this.label().trim(),
      kind: this.compact ? null : this.kind(),
      postalCode: this.postalCode().replace(/\D/g, ''),
      street: this.street().trim(),
      number: this.number().trim(),
      complement: optional(this.complement()),
      district: this.district().trim(),
      city: this.city().trim(),
      state: this.state(),
      deliveryNotes: this.compact ? null : optional(this.deliveryNotes()),
      isBilling: !this.compact && this.makeBilling(),
      isDefaultDelivery: !this.compact && this.makeDefault(),
    };
  }
}
