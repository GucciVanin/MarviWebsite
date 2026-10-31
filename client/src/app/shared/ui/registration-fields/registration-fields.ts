import { Component, computed, input } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import { cnpjKind, todayInBrazil } from '../../format/registration';
import { REGISTRATION_LIMITS, RegistrationDraft } from './registration-draft';

/**
 * The fields of an account's registration data (MRV-9.4): first the two-option account type (when it may still be chosen), then the fields of that
 * type, one labelled control per field. It renders fields only, no `<form>`: the parent owns the form and its submit button (registration, the
 * customer's profile and the admin's editor all embed it). `compact` is the registration page's short form (name, CNPJ or CPF and birth date).
 * `locked` is the customer's view after approval: the verified fields are read-only with the reason given once, the rest stay editable.
 */
@Component({
  selector: 'app-registration-fields',
  templateUrl: './registration-fields.html',
})
export class RegistrationFields {
  protected readonly t = PT.registration;
  protected readonly limits = REGISTRATION_LIMITS;
  protected readonly today = todayInBrazil();
  protected readonly ieStatuses = Object.keys(PT.registration.ieStatuses) as (keyof typeof PT.registration.ieStatuses)[];
  protected readonly regimes = Object.keys(PT.registration.regimes) as (keyof typeof PT.registration.regimes)[];

  readonly draft = input.required<RegistrationDraft>();
  /** Makes ids unique when more than one form is on the page. */
  readonly idPrefix = input.required<string>();
  /** Whether the account type can still be chosen (registration, a Pending customer, an admin); false shows it as plain text. */
  readonly typeEditable = input(true);
  /** The verified record is read-only (the customer after approval); phone, invoice e-mail and contact person stay editable. */
  readonly locked = input(false);
  readonly readOnly = input(false);

  /** The verified fields cannot be edited: the customer after approval, or while a request is in flight. */
  protected readonly fixed = computed(() => this.locked() || this.readOnly());
  protected readonly kind = computed(() => cnpjKind(this.draft().cnpj()));
  /** The ids a field is described by: its hint, and the note that says why it is locked. */
  protected described(hint: string): string {
    return this.locked() ? `${this.id(hint)} ${this.id('lock')}` : this.id(hint);
  }

  protected id(name: string): string {
    return `${this.idPrefix()}-${name}`;
  }

  /** Runs the draft's masking setter and shows the masked text back in the control (the digits typed so far, formatted). */
  protected masked(event: Event, set: (text: string) => void, value: () => string): void {
    const field = event.target as HTMLInputElement;
    set(field.value);
    field.value = value();
  }

  protected pick(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
