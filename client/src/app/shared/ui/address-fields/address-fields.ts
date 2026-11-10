import { Component, computed, inject, input } from '@angular/core';
import { ControlContainer, FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import { BRAZIL_STATES, maskPostalCode } from '../../format/address';
import { ADDRESS_LIMITS, AddressDraft } from './address-draft';

/**
 * The fields of an address form, one labelled control per part (MRV-9.3). It renders fields only, no `<form>`: the parent owns the form and
 * its submit button (registration, the customer's profile and the admin's fix all embed it). The CEP is masked to `00000-000` while typing.
 */
@Component({
  selector: 'app-address-fields',
  imports: [FormsModule],
  templateUrl: './address-fields.html',
  // The controls register with the parent's <form> (the parent owns it), so they validate and reset with it.
  viewProviders: [{ provide: ControlContainer, useFactory: () => inject(ControlContainer, { skipSelf: true }) }],
})
export class AddressFields {
  protected readonly t = PT.address;
  protected readonly states = BRAZIL_STATES;
  protected readonly limits = ADDRESS_LIMITS;
  private readonly allKinds = Object.keys(PT.address.kinds) as (keyof typeof PT.address.kinds)[];
  /** The types offered: an address that is the billing or default delivery one cannot become a type that cannot serve (the server answers 409). */
  readonly allowedKinds = input<readonly string[] | null>(null);
  protected readonly kinds = computed(() => this.allKinds.filter((k) => this.allowedKinds()?.includes(k) ?? true));

  /** What is typed; the parent keeps it and reads it on submit. */
  readonly draft = input.required<AddressDraft>();
  /** Makes ids unique when more than one address form is on the page. */
  readonly idPrefix = input.required<string>();
  /** Registration: only the parts of the place, no label, type, notes or choice of billing/delivery. */
  readonly compact = input(false);
  readonly readOnly = input(false);
  /** Whether "make this the billing / default delivery address" is offered (it is not when the address already is that one). */
  readonly offerBilling = input(true);
  readonly offerDefault = input(true);

  protected onPostalCode(event: Event): void {
    const field = event.target as HTMLInputElement;
    const masked = maskPostalCode(field.value);
    field.value = masked;
    this.draft().postalCode.set(masked);
  }
}
