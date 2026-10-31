import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { isSamePlace } from '../../../shared/format/address';
import { CustomerNumberPipe } from '../../../shared/format/number.pipes';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import type { ClientAddress } from '../../../shared/models/client-address.model';
import { AddressDraft } from '../../../shared/ui/address-fields/address-draft';
import { AddressFields } from '../../../shared/ui/address-fields/address-fields';
import { AddressSummary } from '../../../shared/ui/address-summary/address-summary';
import { RegistrationDraft } from '../../../shared/ui/registration-fields/registration-draft';
import { RegistrationFields } from '../../../shared/ui/registration-fields/registration-fields';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { ClientProfile, ProfileService } from '../api/profile.service';

// The server's limits (ClientProfileRules, ClientAddressRules): checked here too so the customer is told in pt-BR before sending.
const MAX_ADDRESSES = 20;

/**
 * The customer's own company details (MRV-2.2) and their addresses (MRV-9.3). The account type and registration data are one form (locked after approval); the addresses are
 * cards with an "Adicionar endereço" form, edit and remove (after a confirming click). Everything is keyed by the address's opaque key,
 * which is never shown.
 */
@Component({
  selector: 'app-client-profile',
  imports: [FormsModule, ErrorAlert, LoadState, PtDatePipe, CustomerNumberPipe, AddressFields, AddressSummary, RegistrationFields],
  templateUrl: './client-profile.html',
})
export class ClientProfileCard implements OnInit {
  protected readonly t = PT.clientProfile;
  private readonly service = inject(ProfileService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly profile = loadable(() => this.service.get(), null as ClientProfile | null);
  protected readonly saveAction = action();
  protected readonly addressAction = action();

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render.
  /** The account type and registration data being edited (MRV-9.4). Once approved the verified fields are read-only: only an admin changes them. */
  protected readonly registration = new RegistrationDraft();
  protected readonly locked = signal(false);
  /** A Suspended customer edits nothing (MRV-9.4): the whole form is read-only, with the reason. */
  protected readonly suspended = signal(false);
  protected readonly saved = signal(false);
  protected readonly canSave = computed(() => this.registration.canSubmit() && !this.saveAction.busy() && !this.suspended());

  protected readonly addresses = signal<ClientAddress[]>([]);
  protected readonly draft = new AddressDraft();
  protected readonly adding = signal(false);
  protected readonly editingKey = signal<string | null>(null);
  protected readonly removingKey = signal<string | null>(null);
  protected readonly addressMessage = signal<string | null>(null);
  /** A problem found before sending (a repeated place, too many addresses), in pt-BR. */
  protected readonly addressProblem = signal<string | null>(null);
  protected readonly canAddMore = computed(() => this.addresses().length < MAX_ADDRESSES);
  protected readonly canSubmitAddress = computed(() => this.draft.canSubmit() && !this.addressAction.busy());
  protected readonly editing = computed(() => this.addresses().find((a) => a.key === this.editingKey()) ?? null);

  private filled = false;

  constructor() {
    // Fill the form once, when the details first arrive; a retry after an error must not overwrite what is being typed.
    // What the server named by field shows under that field.
    effect(() => {
      const failure = this.saveAction.error();
      untracked(() => this.registration.setServerProblems(failure?.fields ?? []));
    });
    effect(() => {
      const loaded = this.profile.data();
      if (loaded && !this.filled) {
        untracked(() => this.fill(loaded));
      }
    });
  }

  ngOnInit(): void {
    this.profile.load();
  }

  save(): void {
    if (!this.canSave()) {
      return;
    }
    this.saved.set(false);
    const draft = this.registration;
    this.saveAction.run(this.service.update({ companyName: draft.name().trim(), accountType: draft.type()!, registration: draft.request() }), (saved) => {
      this.fillRegistration(saved);
      this.addresses.set(saved.addresses);
      this.saved.set(true);
    });
  }

  protected startAdd(): void {
    this.closeForms();
    this.draft.reset();
    this.adding.set(true);
    this.focusSoon('#address-new-label');
  }

  protected startEdit(address: ClientAddress): void {
    this.closeForms();
    this.draft.load(address);
    this.editingKey.set(address.key);
    this.focusSoon('#address-edit-label');
  }

  protected cancelForm(): void {
    const key = this.editingKey();
    this.closeForms();
    this.focusSoon(key ? this.editButton(key) : '#address-add-btn');
  }

  protected submitAddress(): void {
    if (!this.canSubmitAddress()) {
      return;
    }
    const request = this.draft.request();
    const own = this.editingKey();
    if (own === null && !this.canAddMore()) {
      this.addressProblem.set(this.t.tooMany);
      return;
    }
    const candidate = { postalCode: request.postalCode, number: request.number, complement: request.complement };
    if (this.addresses().some((other) => other.key !== own && isSamePlace(candidate, other))) {
      this.addressProblem.set(this.t.duplicate);
      return;
    }
    this.addressProblem.set(null);
    this.addressMessage.set(null);
    const call = own === null ? this.service.addAddress(request) : this.service.updateAddress(own, request);
    this.addressAction.run(call, () => this.refresh(this.t.addressSaved, own));
  }

  protected askToRemove(address: ClientAddress): void {
    this.closeForms();
    this.addressMessage.set(null);
    this.removingKey.set(address.key);
    this.focusSoon(`#address-confirm-${this.addresses().indexOf(address)}`);
  }

  protected remove(address: ClientAddress): void {
    this.addressMessage.set(null);
    this.addressAction.run(this.service.removeAddress(address.key), () => this.refresh(this.t.addressRemoved, null));
  }

  protected cancelRemoval(): void {
    const key = this.removingKey();
    this.removingKey.set(null);
    this.addressAction.reset();
    this.focusSoon(`#address-remove-btn-${this.addresses().findIndex((a) => a.key === key)}`);
  }

  /** The billing address and the default delivery address stay until another is chosen (the server refuses otherwise, 409). */
  protected canRemove(address: ClientAddress): boolean {
    return !address.isBilling && !address.isDefaultDelivery;
  }

  protected whyNotRemovable(address: ClientAddress): string | null {
    return address.isBilling ? this.t.cannotRemoveBilling : address.isDefaultDelivery ? this.t.cannotRemoveDefault : null;
  }

  /** The types an address may be changed to: the billing one must stay able to bill, the default delivery one able to deliver. */
  protected allowedKinds(address: ClientAddress): readonly string[] | null {
    if (address.isBilling && address.isDefaultDelivery) return ['Both'];
    if (address.isBilling) return ['Billing', 'Both'];
    if (address.isDefaultDelivery) return ['Delivery', 'Both'];
    return null;
  }

  private closeForms(): void {
    this.adding.set(false);
    this.editingKey.set(null);
    this.removingKey.set(null);
    this.addressProblem.set(null);
    this.addressAction.reset();
  }

  /** Reads the profile again after an address change, so the badges (principal, entrega padrão) show what the server now says. */
  private refresh(message: string, returnKey: string | null): void {
    this.closeForms();
    // If the reload fails the form is gone and so is its trigger: focus rests on the section heading, not on the page body.
    this.focusSoon('#addresses-title');
    this.addressAction.run(this.service.get(), (loaded) => {
      this.addresses.set(loaded.addresses);
      this.addressMessage.set(message);
      // Focus goes back to the control that opened the form (an edited address's "Editar", or "Adicionar endereço"); after a removal, to "Adicionar endereço".
      this.focusSoon(returnKey ? this.editButton(returnKey) : '#address-add-btn');
    });
  }

  private editButton(key: string): string {
    return `#address-edit-btn-${this.addresses().findIndex((a) => a.key === key)}`;
  }

  /** Moves keyboard focus once the next render has put the element on the page; the section heading is the fallback when it is gone (for example no "Adicionar" at 20 addresses). */
  private focusSoon(selector: string): void {
    afterNextRender(() => {
      const root = this.host.nativeElement;
      (root.querySelector<HTMLElement>(selector) ?? root.querySelector<HTMLElement>('#addresses-title'))?.focus();
    }, { injector: this.injector });
  }

  private fill(profile: ClientProfile): void {
    this.filled = true;
    this.fillRegistration(profile);
    this.addresses.set(profile.addresses);
  }

  private fillRegistration(profile: ClientProfile): void {
    this.registration.load(profile.companyName, profile.registration);
    this.locked.set(profile.registrationLocked);
    this.suspended.set(profile.status === 'Suspended');
  }
}
