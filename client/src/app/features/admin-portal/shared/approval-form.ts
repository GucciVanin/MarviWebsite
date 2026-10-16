import { Component, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import type { PricingTier } from '../api/admin.service';

/**
 * Approving a customer is the admin's explicit choice of their pricing tier (least privilege: nobody is approved by default).
 * The select starts empty unless a tier is suggested (a suspended customer's current one), and confirming needs a tier to be
 * chosen. The parent sends the request; this only collects the decision.
 */
@Component({
  selector: 'app-approval-form',
  imports: [FormsModule],
  templateUrl: './approval-form.html',
})
export class ApprovalForm {
  protected readonly t = PT.adminCustomers;

  readonly tiers = input.required<PricingTier[]>();
  /** A tier to propose (it is used only if the list offers it). */
  readonly suggestedTierId = input<string | null>(null);
  /** A request is running: confirming is off. */
  readonly busy = input(false);

  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly chosen = linkedSignal(() => {
    const suggested = this.suggestedTierId();
    return suggested && this.tiers().some((tier) => tier.id === suggested) ? suggested : '';
  });
  protected readonly canConfirm = computed(() => this.chosen() !== '' && !this.busy());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // The form appears in the middle of a table: put the keyboard on its select so the admin does not have to tab to it.
    afterNextRender(() => this.host.nativeElement.querySelector('select')?.focus());
  }

  protected confirm(): void {
    if (this.canConfirm()) {
      this.confirmed.emit(this.chosen());
    }
  }
}
