import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { action } from '../../../core/http/action';
import { PT } from '../../../core/i18n/pt-br';
import { CoverageService } from '../../../features/storefront/api/coverage.service';
import type { CoverageCheckResult } from '../../../features/storefront/api/coverage.service';
import { defaultDeliveryOf, deliverableAddresses, formatAddress } from '../../format/address';
import type { ClientAddress } from '../../models/client-address.model';
import { AddressSummary } from '../address-summary/address-summary';

let nextPicker = 0;

/**
 * "Entregar em" (MRV-9.6): the customer's delivery addresses (type Delivery or Both) in a select by label and one-line summary, the chosen one
 * written out below it, and an optional "Verificar cobertura" that asks the existing coverage check about the chosen address. Coverage is
 * information only: its answer, or its failure, never disables anything. The key of an address is the value of an option and is never shown.
 * With no address that can receive goods it shows why and, when the parent provides one, a way to add an address.
 */
@Component({
  selector: 'app-delivery-picker',
  imports: [AddressSummary],
  template: `
    @if (deliverable().length === 0) {
      <p class="alert" role="status" data-testid="delivery-none">{{ noneText() }}</p>
      @if (addLabel(); as add) {
        <button type="button" class="btn btn--outline btn--small btn--wrap" data-testid="delivery-add" (click)="addAddress.emit()">{{ add }}</button>
      }
    } @else {
      <div class="delivery-picker stack">
        <div class="field">
          <label [for]="selectId">{{ t.deliverTo }}</label>
          <select [id]="selectId" data-testid="delivery-select" [disabled]="disabled()" (change)="choose($any($event.target).value)">
            @if (!selected()) {
              <option value="" selected>{{ t.choose }}</option>
            }
            @for (address of deliverable(); track address.key) {
              <option [value]="address.key" [selected]="address.key === selectedKey()">{{ optionLabel(address) }}</option>
            }
          </select>
        </div>
        @if (selected(); as address) {
          <div class="address-card" data-testid="delivery-selected">
            <app-address-summary [address]="address" />
          </div>
        }
        <div class="toolbar">
          @if (coverage()) {
            <button type="button" class="btn btn--outline btn--small btn--wrap" data-testid="delivery-coverage" [disabled]="!selected() || coverageAction.busy()" (click)="checkCoverage()">
              {{ coverageAction.busy() ? t.checking : t.checkCoverage }}
            </button>
          }
          @if (addLabel(); as add) {
            <button type="button" class="btn btn--outline btn--small btn--wrap" data-testid="delivery-add" (click)="addAddress.emit()">{{ add }}</button>
          }
        </div>
        @if (coverage()) {
          <p class="muted" data-testid="delivery-coverage-notice">{{ t.coverageNotice }}</p>
        }
        <p role="status" class="delivery-picker__result" data-testid="delivery-coverage-result">{{ coverageText() }}</p>
        @if (coverageAction.error()) {
          <p class="alert" role="status" data-testid="delivery-coverage-failed">{{ t.coverageFailed }}</p>
        }
      </div>
    }
  `,
})
export class DeliveryPicker {
  protected readonly t = PT.delivery;
  private readonly coverageService = inject(CoverageService);

  /** Every address of the customer; only the ones that can receive goods are listed. */
  readonly addresses = input.required<readonly ClientAddress[]>();
  /** The key of the chosen address (two-way). */
  readonly selectedKey = model<string | null>(null);
  /** The customer's default delivery address (its key), preselected while nothing valid is chosen. */
  readonly defaultKey = input<string | null>(null);
  readonly noneText = input<string>(PT.delivery.noneCustomer);
  /** The text of the button that sends the person to the place where an address is added; absent means there is no such place for this reader. */
  readonly addLabel = input<string | null>(null);
  /** Whether to offer "Verificar cobertura". */
  readonly coverage = input(true);
  readonly disabled = input(false);
  readonly addAddress = output<void>();

  protected readonly selectId = `delivery-select-${++nextPicker}`;
  protected readonly deliverable = computed(() => deliverableAddresses(this.addresses()));
  protected readonly selected = computed(() => this.deliverable().find((a) => a.key === this.selectedKey()) ?? null);
  protected readonly coverageAction = action({ latestOnly: true });
  private readonly result = signal<{ key: string; value: CoverageCheckResult } | null>(null);
  /** The answer only counts for the address it was asked about: choosing another clears it. */
  protected readonly coverageText = computed(() => {
    const found = this.result();
    if (!found || found.key !== this.selectedKey()) {
      return '';
    }
    return found.value.supported ? (found.value.warehouseName ? `${this.t.coveredFrom} ${found.value.warehouseName}.` : this.t.covered) : this.t.notCovered;
  });

  constructor() {
    // Keep the choice valid: an address that is gone (or none chosen yet) falls back to the default delivery address, else to "Escolha…".
    effect(() => {
      const list = this.deliverable();
      const chosen = untracked(() => this.selectedKey());
      if (chosen !== null && list.some((a) => a.key === chosen)) {
        return;
      }
      const fallback = defaultDeliveryOf({ addresses: list, defaultDeliveryKey: this.defaultKey() })?.key ?? null;
      if (fallback !== chosen) {
        untracked(() => this.selectedKey.set(fallback));
      }
    });
  }

  protected optionLabel(address: ClientAddress): string {
    const line = formatAddress(address);
    return `${address.label} — ${line}${address.needsReview ? ` (${this.t.needsReview})` : ''}`;
  }

  protected choose(key: string): void {
    this.selectedKey.set(key || null);
    this.coverageAction.reset();
  }

  protected checkCoverage(): void {
    const address = this.selected();
    if (!address) {
      return;
    }
    this.result.set(null);
    this.coverageAction.run(this.coverageService.check({ address: formatAddress(address) }), (value) => this.result.set({ key: address.key, value }));
  }
}
