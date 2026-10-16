import { Signal, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiError, describeApiError } from './api-error';

/** Something the user does that calls the API (accept, create, look up). Failure becomes a pt-BR `error` to display. */
export interface Action {
  readonly busy: Signal<boolean>;
  readonly error: Signal<ApiError | null>;
  run<T>(request: Observable<T>, onSuccess?: (value: T) => void): void;
  /** Forgets the last failure, so it is not shown next to something unrelated (another item, another search). */
  reset(): void;
}

export interface ActionOptions {
  /**
   * For lookups: only the request run last is acted on, so a slow earlier search cannot overwrite a newer one. Leave it off for
   * saves and deletes, where every request must be carried through.
   */
  latestOnly?: boolean;
}

// Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
export function action(options: ActionOptions = {}): Action {
  const busy = signal(false);
  const error = signal<ApiError | null>(null);
  let latest = 0;

  return {
    busy: busy.asReadonly(),
    error: error.asReadonly(),
    run(request, onSuccess) {
      const mine = ++latest;
      const superseded = () => options.latestOnly === true && mine !== latest;
      busy.set(true);
      error.set(null);
      request.subscribe({
        next: (value) => {
          if (superseded()) {
            return;
          }
          busy.set(false);
          onSuccess?.(value);
        },
        error: (failure: unknown) => {
          if (superseded()) {
            return;
          }
          busy.set(false);
          error.set(describeApiError(failure));
        },
      });
    },
    reset() {
      error.set(null);
    },
  };
}
