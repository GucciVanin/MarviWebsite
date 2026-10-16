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
  protected readonly message = signal<string | null>(null);
  protected readonly decide = action();

  constructor() {
    // Another admin decided first (a 409): what is on screen is stale, so refresh it without being asked.
    effect(() => {
      if (this.decide.error()?.status === 409) {
        untracked(() => this.refresh());
      }
    });
  }

  ngOnInit(): void {
    this.refresh();
    this.tiers.load();
  }

  protected refresh(): void {
    this.service.refresh();
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
    this.decide.run(this.admin.approveClient(id, { pricingTierId }), () => this.decided(this.t.approved));
  }

  protected suspend(id: string): void {
    this.message.set(null);
    this.decide.run(this.admin.suspendClient(id), () => this.decided(this.t.suspended));
  }

  private decided(message: string): void {
    this.message.set(message);
    this.approvingId.set(null);
    this.confirmingSuspendId.set(null);
    this.refresh();
  }
}
