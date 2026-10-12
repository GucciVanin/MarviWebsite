import { Component, input, output } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import type { ApiError } from '../../../core/http/api-error';

/** A failed request, in pt-BR, with the server's own text as secondary detail and an optional retry. */
@Component({
  selector: 'app-error-alert',
  template: `
    @if (error(); as failure) {
      <div role="alert">
        <p>{{ failure.message }}</p>
        @if (failure.detail) {
          <small>{{ failure.detail }}</small>
        }
        @if (retryable()) {
          <button type="button" (click)="retry.emit()">{{ t.retry }}</button>
        }
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
