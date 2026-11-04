import { Component, computed, input } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import { formatPlaceLine, formatStreetLine } from '../../format/address';
import type { ClientAddress } from '../../models/client-address.model';

/**
 * One address as a read-only box (MRV-9.3): its label, what it is used for ("Principal", "Entrega padrão", the type), the street and place
 * lines and the delivery notes. The parent adds its own actions below (edit, remove) as projected content. The key is never rendered.
 */
@Component({
  selector: 'app-address-summary',
  template: `
    <div class="toolbar">
      <strong>{{ address().label }}</strong>
      @if (address().isBilling) {
        <span class="badge badge--ok">{{ t.principal }}</span>
      }
      @if (address().isDefaultDelivery) {
        <span class="badge badge--ok">{{ t.defaultDelivery }}</span>
      }
      <span class="badge">{{ kinds[address().kind] }}</span>
      @if (address().needsReview) {
        <span class="badge badge--warn">{{ a.review }}</span>
      }
    </div>
    <p>{{ streetLine() }}</p>
    <p class="muted">{{ placeLine() }}</p>
    @if (address().deliveryNotes; as notes) {
      <p class="muted">{{ a.notes }}: {{ notes }}</p>
    }
    <ng-content />
  `,
})
export class AddressSummary {
  protected readonly t = PT.clientProfile;
  protected readonly a = PT.address;
  protected readonly kinds = PT.address.kinds as Record<string, string>;

  readonly address = input.required<ClientAddress>();

  protected readonly streetLine = computed(() => formatStreetLine(this.address()));
  protected readonly placeLine = computed(() => formatPlaceLine(this.address()));
}
