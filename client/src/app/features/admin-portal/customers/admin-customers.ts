import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { ApprovalForm } from '../shared/approval-form';
import { CustomerNumberPipe } from '../../../shared/format/number.pipes';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import type { ClientAddress } from '../../../shared/models/client-address.model';
import type { ClientSummary } from '../../../shared/models/client-summary.model';
import type { PagedResult } from '../../../shared/models/paged.model';
import { AddressDraft } from '../../../shared/ui/address-fields/address-draft';
import { AddressFields } from '../../../shared/ui/address-fields/address-fields';
import { AddressSummary } from '../../../shared/ui/address-summary/address-summary';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { EmployeeService } from '../../employee-portal/api/employee.service';
import { AdminService, PricingTier } from '../api/admin.service';
import { PendingActionsService } from '../api/pending-actions.service';

const PAGE_SIZE = 20;

/**
 * Customers for admins (MRV-2.4b.4): find a customer by company name, change their pricing tier, suspend
 * them (after a confirming click) and approve them again. The admin sees every refusal in pt-BR with the server's reason.
 */
@Component({
  selector: 'app-admin-customers',
  imports: [FormsModule, RouterLink, ErrorAlert, LoadState, PtDatePipe, CustomerNumberPipe, ApprovalForm, AddressFields, AddressSummary],
  templateUrl: './admin-customers.html',
})
export class AdminCustomers implements OnInit {
  protected readonly t = PT.adminCustomers;
  protected readonly portal = PT.employeePortal;
  protected readonly refs = PT.numbers;
  protected readonly a = PT.address;
  private readonly admin = inject(AdminService);
  private readonly staff = inject(EmployeeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly pendingActions = inject(PendingActionsService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly search = signal('');
  private readonly appliedSearch = signal('');
  protected readonly customers = loadable(
    () => this.admin.searchClients(this.appliedSearch(), PAGE_SIZE),
    { items: [], page: 1, pageSize: PAGE_SIZE, totalCount: 0 } as PagedResult<ClientSummary>,
  );
  protected readonly tiers = loadable(() => this.admin.getPricingTiers(), [] as PricingTier[]);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editTierId = signal('');
  protected readonly confirmingSuspendId = signal<string | null>(null);
  /** The customer whose approval is being decided, and the tier the admin has chosen for them. */
  protected readonly approvingId = signal<string | null>(null);
  /** The tier proposed in the approval form: a suspended customer's own (a pending one has none: nothing is preselected). */
  protected readonly suggestedTierId = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly saveAction = action();

  /** The addresses of the customer being edited, and the one being fixed (MRV-9.3). The key is only passed to the API, never shown. */
  protected readonly addresses = signal<ClientAddress[]>([]);
  protected readonly fixingKey = signal<string | null>(null);
  protected readonly draft = new AddressDraft();
  protected readonly addressesAction = action({ latestOnly: true });
  protected readonly fixAction = action();
  protected readonly addressMessage = signal<string | null>(null);
  protected readonly canFix = computed(() => this.draft.canSubmit() && !this.fixAction.busy());

  protected readonly canSave = computed(() => this.editTierId() !== '' && !this.saveAction.busy());

  ngOnInit(): void {
    this.customers.load();
    this.tiers.load();
  }

  protected find(): void {
    this.appliedSearch.set(this.search().trim());
    this.message.set(null);
    this.confirmingSuspendId.set(null);
    this.saveAction.reset();
    this.stopEditing();
    this.customers.load();
  }

  protected edit(customer: ClientSummary): void {
    this.message.set(null);
    this.saveAction.reset();
    this.approvingId.set(null);
    this.confirmingSuspendId.set(null);
    this.editingId.set(customer.id);
    this.editTierId.set(customer.pricingTierId ?? '');
    this.loadAddresses(customer);
  }

  private loadAddresses(customer: ClientSummary, returnKey: string | null = null): void {
    this.addresses.set([]);
    this.fixingKey.set(null);
    this.addressMessage.set(null);
    this.fixAction.reset();
    if (returnKey) {
      // If the reload fails the form is gone and so is its trigger: focus rests on the section heading, not on the page body.
      this.focusSoon('#admin-addresses-title');
    }
    this.addressesAction.run(this.staff.getClient(customer.id), (profile) => {
      this.addresses.set(profile.addresses);
      if (returnKey) {
        this.focusSoon(this.fixButton(returnKey));
      }
    });
  }

  /** The types an address may be changed to: the billing one must stay able to bill, the default delivery one able to deliver. */
  protected allowedKinds(address: ClientAddress): readonly string[] | null {
    if (address.isBilling && address.isDefaultDelivery) return ['Both'];
    if (address.isBilling) return ['Billing', 'Both'];
    if (address.isDefaultDelivery) return ['Delivery', 'Both'];
    return null;
  }

  protected startFix(address: ClientAddress): void {
    this.fixAction.reset();
    this.addressMessage.set(null);
    this.draft.load(address);
    this.fixingKey.set(address.key);
    this.focusSoon('#admin-address-label');
  }

  protected cancelFix(): void {
    const key = this.fixingKey();
    this.fixingKey.set(null);
    this.fixAction.reset();
    if (key) {
      this.focusSoon(this.fixButton(key));
    }
  }

  private fixButton(key: string): string {
    return `#admin-fix-btn-${this.addresses().findIndex((a) => a.key === key)}`;
  }

  /** Moves keyboard focus once the next render has put the element on the page. */
  private focusSoon(selector: string): void {
    afterNextRender(() => {
      const root = this.host.nativeElement;
      (root.querySelector<HTMLElement>(selector) ?? root.querySelector<HTMLElement>('#admin-addresses-title'))?.focus();
    }, { injector: this.injector });
  }

  protected saveFix(customer: ClientSummary): void {
    const key = this.fixingKey();
    if (key === null || !this.canFix()) {
      return;
    }
    this.fixAction.run(this.admin.updateClientAddress(customer.id, key, this.draft.request()), () => {
      // Another customer's editor opened meanwhile: this answer is no longer about what is shown.
      if (this.editingId() !== customer.id) {
        return;
      }
      this.loadAddresses(customer, key);
      this.addressMessage.set(this.t.addressSaved);
    });
  }

  protected stopEditing(): void {
    this.saveAction.reset();
    this.editingId.set(null);
  }

  protected save(customer: ClientSummary): void {
    if (!this.canSave()) {
      return;
    }
    this.message.set(null);
    this.saveAction.run(
      this.admin.updateClientTier(customer.id, { pricingTierId: this.editTierId() }),
      () => this.done(this.t.saved),
    );
  }

  protected askToSuspend(customer: ClientSummary): void {
    this.message.set(null);
    this.saveAction.reset();
    this.approvingId.set(null);
    this.editingId.set(null);
    this.confirmingSuspendId.set(customer.id);
  }

  protected suspend(customer: ClientSummary): void {
    this.message.set(null);
    this.saveAction.run(this.admin.suspendClient(customer.id), () => this.done(this.t.suspended));
  }

  /**
   * "Aprovar" is for every customer who is not approved. Least privilege: nobody is approved by default, so approving always
   * needs the admin to choose a pricing tier. For a pending customer nothing is preselected; for a suspended one their current
   * tier is suggested, and either way a confirming click follows.
   */
  protected askToApprove(customer: ClientSummary): void {
    this.message.set(null);
    this.saveAction.reset();
    this.editingId.set(null);
    this.confirmingSuspendId.set(null);
    this.approvingId.set(customer.id);
    this.suggestedTierId.set(customer.status === 'Suspended' ? customer.pricingTierId : null);
  }

  protected cancelApproval(): void {
    this.approvingId.set(null);
  }

  protected approve(customer: ClientSummary, pricingTierId: string): void {
    this.message.set(null);
    this.saveAction.run(this.admin.approveClient(customer.id, { pricingTierId }), () => this.done(this.t.approved));
  }

  private done(message: string): void {
    this.message.set(message);
    this.editingId.set(null);
    this.confirmingSuspendId.set(null);
    this.approvingId.set(null);
    this.customers.load();
    // A decision here changes what is waiting in the admin inbox (and the count on its tab).
    this.pendingActions.refresh(true);
  }
}
