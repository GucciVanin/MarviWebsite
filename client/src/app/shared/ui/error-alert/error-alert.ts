import { Component, input, output } from '@angular/core';
import { AppIcon } from '../app-icon/app-icon';
import { PT } from '../../../core/i18n/pt-br';
import type { ApiError } from '../../../core/http/api-error';

/** A failed request, in pt-BR, with the server's own text as secondary detail and an optional retry. */
@Component({
  selector: 'app-error-alert',
  imports: [AppIcon],
  styles: `
    p { margin: 0; }
    small { display: block; margin-top: 0.15rem; }
    button { margin-top: 0.5rem; }
  `,
  template: `
    @if (error(); as failure) {
      <div role="alert" class="alert alert--error">
        <app-icon name="alert-circle" />
        <div class="error-alert__body">
          <p>{{ failure.message }}</p>
          @if (failure.detail) {
            <small>{{ failure.detail }}</small>
          }
          @if (retryable()) {
            <button type="button" class="btn btn--outline btn--small" (click)="retry.emit()">
              <app-icon name="refresh-cw" />{{ t.retry }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class ErrorAlert {
  protected readonly t = PT.state;

  readonly error = input<ApiError | null>(null);
  readonly retryable = input(false);
  readonly retry = output<void>();
}
