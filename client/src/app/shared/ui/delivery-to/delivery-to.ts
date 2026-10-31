import { Component, computed, input } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import { formatPlaceLine, formatStreetLine } from '../../format/address';
import type { DeliveryAddressSnapshot } from '../../models/delivery-address.model';

/**
 * Where a quote or an order is delivered (MRV-9.6), read-only: the label of the address the customer chose and the address as it was then.
 * A document without a snapshot (an order from before addresses were structured) shows its old text, or "Endereço a confirmar". The
 * text is the customer's own, shown as text (never as markup). `compact` is one line, for a table cell.
 */
@Component({
  selector: 'app-delivery-to',
  template: `
    @if (snapshot(); as a) {
      @if (compact()) {
        <span data-testid="delivery-to"><strong>{{ a.label }}</strong>: {{ a.line }}</span>
      } @else {
        <div class="delivery-to" data-testid="delivery-to">
          <p><strong>{{ t.deliverTo }}:</strong> {{ a.label }}</p>
          <p>{{ streetLine() }}</p>
          <p class="muted">{{ placeLine() }}</p>
          @if (a.notes) {
            <p class="muted">{{ t.notes }}: {{ a.notes }}</p>
          }
        </div>
      }
    } @else if (compact()) {
      <span data-testid="delivery-to">{{ text() || t.toConfirm }}</span>
    } @else {
      <p class="delivery-to muted" data-testid="delivery-to"><strong>{{ t.deliverTo }}:</strong> {{ text() || t.toConfirm }}</p>
    }
  `,
})
export class DeliveryTo {
  protected readonly t = PT.delivery;

  readonly snapshot = input<DeliveryAddressSnapshot | null | undefined>(null);
  /** The old free text of an order made before MRV-9.6; shown only when there is no snapshot. */
  readonly text = input<string | null | undefined>(null);
  readonly compact = input(false);

  protected readonly streetLine = computed(() => {
    const a = this.snapshot();
    return a ? formatStreetLine(a) : '';
  });
  protected readonly placeLine = computed(() => {
    const a = this.snapshot();
    return a ? formatPlaceLine(a) : '';
  });
}
