import { Component, computed, input } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import type { Loadable } from '../../../core/http/loadable';
import { ErrorAlert } from '../error-alert/error-alert';

/** Shows what a data section needs besides its data: loading, a failure with retry, or the empty message. */
@Component({
  selector: 'app-load-state',
  imports: [ErrorAlert],
  template: `
    @if (state().error()) {
      <app-error-alert [error]="state().error()" [retryable]="true" (retry)="state().load()" />
    } @else if (state().loading() && !state().loaded()) {
      <p role="status">{{ t.loading }}</p>
    } @else if (empty() && emptyText()) {
      <p>{{ emptyText() }}</p>
    }
  `,
})
export class LoadState {
  protected readonly t = PT.state;

  readonly state = input.required<Loadable<unknown>>();
  /** Message shown when the data loaded fine but is an empty list. */
  readonly emptyText = input<string | null>(null);

  protected readonly empty = computed(() => {
    const state = this.state();
    const data = state.data();
    return state.loaded() && Array.isArray(data) && data.length === 0;
  });
}
