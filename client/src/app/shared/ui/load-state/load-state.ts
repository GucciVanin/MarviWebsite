import { Component, computed, input } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import type { Loadable } from '../../../core/http/loadable';
import { AppIcon } from '../app-icon/app-icon';
import { ErrorAlert } from '../error-alert/error-alert';

/** Shows what a data section needs besides its data: loading, a failure with retry, or the empty message. */
@Component({
  selector: 'app-load-state',
  imports: [ErrorAlert, AppIcon],
  styles: `
    .load-state { display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-muted); }
    /* Same box as the real list (.product-grid: gap, stretch, the ul's default block margins) so the swap moves nothing. */
    .load-state--cards { margin-block: 1em; }
  `,
  template: `
    @if (state().error()) {
      <app-error-alert [error]="state().error()" [retryable]="true" (retry)="state().load()" />
    } @else if (state().loading() && !state().loaded()) {
      @if (variant() === 'cards') {
        <!-- Placeholder cards for a grid; the status text stays for assistive technology only. -->
        <div role="status" class="load-state--cards product-grid" data-testid="skeleton-cards">
          <span class="visually-hidden">{{ t.loading }}</span>
          @for (n of placeholders(); track n) {
            <div class="skeleton-card" aria-hidden="true">
              <span class="skeleton skeleton--title"></span>
              <span class="skeleton skeleton--line skeleton--short"></span>
              <span class="skeleton skeleton--line"></span>
              <span class="skeleton skeleton--pill"></span>
            </div>
          }
        </div>
      } @else {
        <p role="status" class="load-state"><app-icon name="loader" class="icon-spin" />{{ t.loading }}</p>
      }
    } @else if (empty() && emptyText()) {
      <p class="load-state load-state--empty"><app-icon name="inbox" />{{ emptyText() }}</p>
    }
  `,
})
export class LoadState {
  protected readonly t = PT.state;

  readonly state = input.required<Loadable<unknown>>();
  /** Message shown when the data loaded fine but is an empty list. */
  readonly emptyText = input<string | null>(null);
  /** "text" (default) is the spinner line; "cards" shows skeleton cards in the product grid layout while loading. */
  readonly variant = input<'text' | 'cards'>('text');
  /** How many skeleton cards the "cards" variant shows. */
  readonly skeletonCount = input(6);

  protected readonly placeholders = computed(() => Array.from({ length: Math.max(0, this.skeletonCount()) }, (_, i) => i));

  protected readonly empty = computed(() => {
    const state = this.state();
    const data = state.data();
    return state.loaded() && Array.isArray(data) && data.length === 0;
  });
}
