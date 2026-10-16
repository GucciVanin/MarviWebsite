import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import type { ClientSummary } from '../../../shared/models/client-summary.model';
import type { PagedResult } from '../../../shared/models/paged.model';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, PricingTier } from '../api/admin.service';

const PAGE_SIZE = 20;

/**
 * Customers for admins (MRV-2.4b.4): find a customer by company name, change their pricing tier, suspend
 * them (after a confirming click) and approve them again. The admin sees every refusal in pt-BR with the server's reason.
 */
@Component({
  selector: 'app-admin-customers',
  imports: [FormsModule, ErrorAlert, LoadState, PtDatePipe],
  templateUrl: './admin-customers.html',
})
export class AdminCustomers implements OnInit {
  protected readonly t = PT.adminCustomers;
  protected readonly portal = PT.employeePortal;
  private readonly admin = inject(AdminService);

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
  protected readonly approveTierId = signal('');
  protected readonly message = signal<string | null>(null);
  protected readonly saveAction = action();

  protected readonly canSave = computed(() => this.editTierId() !== '' && !this.saveAction.busy());
  protected readonly canApprove = computed(() => this.approveTierId() !== '' && !this.saveAction.busy());

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
    // Only a tier the list actually offers can be suggested (it may not have loaded, or may have been deleted).
    const suggested = customer.status === 'Suspended' ? customer.pricingTierId : null;
    this.approveTierId.set(suggested && this.tiers.data().some((tier) => tier.id === suggested) ? suggested : '');
  }

  protected cancelApproval(): void {
    this.approvingId.set(null);
  }

  protected approve(customer: ClientSummary): void {
    if (!this.canApprove()) {
      return;
    }
    this.message.set(null);
    this.saveAction.run(this.admin.approveClient(customer.id, { pricingTierId: this.approveTierId() }), () => this.done(this.t.approved));
  }

  private done(message: string): void {
    this.message.set(message);
    this.editingId.set(null);
    this.confirmingSuspendId.set(null);
    this.approvingId.set(null);
    this.customers.load();
  }
}
