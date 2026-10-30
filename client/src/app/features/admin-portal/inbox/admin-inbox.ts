import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { CustomerNumberPipe, DocumentNumberPipe } from '../../../shared/format/number.pipes';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, PricingTier } from '../api/admin.service';
import { ContactMessagesService } from '../api/contact-messages.service';
import { PendingActionsService } from '../api/pending-actions.service';
import { ApprovalForm } from '../shared/approval-form';

/**
 * Something that is plainly an address: no characters that could add mailto parameters (? & = %), headers or paths, a local part
 * of at most 64 characters, and a dotted domain. Only such a visitor-supplied e-mail becomes a link.
 */
const MAILTO_ADDRESS = /^[^\s@<>"',;:?&=%#/\\`]{1,64}@([A-Za-z0-9-]+\.)+[A-Za-z0-9-]{2,}$/;

/**
 * The admin's inbox (MRV-6.3): everything that is waiting on an admin, in one place. A new customer stays Pending until an
 * admin approves or suspends them, and that decision is taken right here; the other groups (quotes nobody has priced, stock
 * to reorder, products with no price) point to the screen that resolves them. The count shows in the admin navigation too.
 */
@Component({
  selector: 'app-admin-inbox',
  imports: [RouterLink, ErrorAlert, LoadState, PtDatePipe, CustomerNumberPipe, DocumentNumberPipe, ApprovalForm],
  templateUrl: './admin-inbox.html',
})
export class AdminInbox implements OnInit {
  protected readonly t = PT.adminInbox;
  protected readonly refs = PT.numbers;
  private readonly admin = inject(AdminService);
  private readonly service = inject(PendingActionsService);
  private readonly contact = inject(ContactMessagesService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly pending = this.service.pending;
  protected readonly data = computed(() => this.pending.data());
  protected readonly tiers = loadable(() => this.admin.getPricingTiers(), [] as PricingTier[]);

  protected readonly approvingId = signal<string | null>(null);
  protected readonly confirmingSuspendId = signal<string | null>(null);
  /** Customers an admin has just decided: gone from the list at once, before the refreshed list arrives. */
  private readonly decidedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly waitingCustomers = computed(() => (this.data()?.customers.items ?? []).filter((customer) => !this.decidedIds().has(customer.id)));
  /** Contact messages an admin has just marked handled: gone from the list at once, before the refreshed list arrives. */
  private readonly handledIds = signal<ReadonlySet<string>>(new Set());
  /** The contact-message group; a response without it counts as an empty group. */
  protected readonly contactGroup = computed(() => this.data()?.contactMessages ?? { count: 0, items: [] });
  protected readonly waitingMessages = computed(() => this.contactGroup().items.filter((m) => !this.handledIds().has(m.id)));
  protected readonly message = signal<string | null>(null);
  protected readonly decide = action();
  protected readonly handle = action();
  /** A 404 gets its own sentence ("it no longer exists"); every other failure uses the standard alert. */
  protected readonly handleError = computed(() => (this.handle.error()?.status === 404 ? null : this.handle.error()));
  protected readonly messageGone = computed(() => this.handle.error()?.status === 404);

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
    // The message was handled first by another admin (409) or no longer exists (404): refresh without being asked.
    effect(() => {
      const status = this.handle.error()?.status;
      if (status === 409 || status === 404) {
        untracked(() => this.service.refresh(true));
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

  protected markHandled(id: string): void {
    this.message.set(null);
    this.handle.run(this.contact.handle(id), () => {
      this.message.set(this.t.handled);
      this.handledIds.update((ids) => new Set(ids).add(id));
      this.service.refresh(true);
    });
  }

  /** A mailto link only for something that looks like an address; anything else shows as text alone. */
  protected mailto(email: string): string | null {
    return email.length <= 254 && MAILTO_ADDRESS.test(email) ? `mailto:${email}` : null;
  }

  private decided(id: string, message: string): void {
    this.message.set(message);
    this.approvingId.set(null);
    this.confirmingSuspendId.set(null);
    this.decidedIds.update((ids) => new Set(ids).add(id));
    this.service.refresh(true);
  }
}
