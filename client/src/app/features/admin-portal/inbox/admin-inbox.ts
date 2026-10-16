import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, PricingTier } from '../api/admin.service';
import { PendingActionsService } from '../api/pending-actions.service';
import { ApprovalForm } from '../shared/approval-form';

/**
 * The admin's inbox (MRV-6.3): everything that is waiting on an admin, in one place. A new customer stays Pending until an
 * admin approves or suspends them, and that decision is taken right here; the other groups (quotes nobody has priced, stock
 * to reorder, products with no price) point to the screen that resolves them. The count shows in the admin navigation too.
 */
@Component({
  selector: 'app-admin-inbox',
  imports: [RouterLink, ErrorAlert, LoadState, PtDatePipe, ApprovalForm],
  templateUrl: './admin-inbox.html',
})
export class AdminInbox implements OnInit {
  protected readonly t = PT.adminInbox;
  private readonly admin = inject(AdminService);
  private readonly service = inject(PendingActionsService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly pending = this.service.pending;
  protected readonly data = computed(() => this.pending.data());
  protected readonly tiers = loadable(() => this.admin.getPricingTiers(), [] as PricingTier[]);

  protected readonly approvingId = signal<string | null>(null);
  protected readonly confirmingSuspendId = signal<string | null>(null);
  /** Customers an admin has just decided: gone from the list at once, before the refreshed list arrives. */
  private readonly decidedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly waitingCustomers = computed(() => (this.data()?.customers.items ?? []).filter((customer) => !this.decidedIds().has(customer.id)));
  protected readonly message = signal<string | null>(null);
  protected readonly decide = action();

  constructor() {
    // Another admin decided first (a 409): what is on screen is stale, so refresh it without being asked.
    effect(() => {
      if (this.decide.error()?.status === 409) {
        untracked(() => {
          this.approvingId.set(null);
          this.confirmingSuspendId.set(null);
          this.service.refresh(true);
        });
      }
    });
  }

  ngOnInit(): void {
    this.service.refresh();
    this.tiers.load();
  }

  /** The refresh button: always asks again. */
  protected refresh(): void {
    this.service.refresh(true);
  }

  /** "1 item aguardando" / "3 itens aguardando". */
  protected waitingText(total: number): string {
    return `${total} ${total === 1 ? this.t.waitingOne : this.t.waitingMany}`;
  }

  protected itemsText(count: number): string {
    return `${count} ${count === 1 ? this.t.itemOne : this.t.itemMany}`;
  }

  protected askToApprove(id: string): void {
    this.message.set(null);
    this.decide.reset();
    this.confirmingSuspendId.set(null);
    this.approvingId.set(id);
  }

  protected askToSuspend(id: string): void {
    this.message.set(null);
    this.decide.reset();
    this.approvingId.set(null);
    this.confirmingSuspendId.set(id);
  }

  protected approve(id: string, pricingTierId: string): void {
    this.message.set(null);
    this.decide.run(this.admin.approveClient(id, { pricingTierId }), () => this.decided(id, this.t.approved));
  }

  protected suspend(id: string): void {
    this.message.set(null);
    this.decide.run(this.admin.suspendClient(id), () => this.decided(id, this.t.suspended));
  }

  private decided(id: string, message: string): void {
    this.message.set(message);
    this.approvingId.set(null);
    this.confirmingSuspendId.set(null);
    this.decidedIds.update((ids) => new Set(ids).add(id));
    this.service.refresh(true);
  }
}
