import { Signal, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiError, describeApiError } from './api-error';

/** Something the user does that calls the API (accept, create, look up). Failure becomes a pt-BR `error` to display. */
export interface Action {
  readonly busy: Signal<boolean>;
  readonly error: Signal<ApiError | null>;
  run<T>(request: Observable<T>, onSuccess?: (value: T) => void): void;
}

// Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
export function action(): Action {
  const busy = signal(false);
  const error = signal<ApiError | null>(null);

  return {
    busy: busy.asReadonly(),
    error: error.asReadonly(),
    run(request, onSuccess) {
      busy.set(true);
      error.set(null);
      request.subscribe({
        next: (value) => {
          busy.set(false);
          onSuccess?.(value);
        },
        error: (failure: unknown) => {
          busy.set(false);
          error.set(describeApiError(failure));
        },
      });
    },
  };
}
