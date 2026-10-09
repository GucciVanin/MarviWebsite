import { Signal, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiError, describeApiError } from './api-error';

/** A resource loaded from the API, with the state a screen needs to tell "loading", "failed" and "empty" apart. */
export interface Loadable<T> {
  readonly data: Signal<T>;
  readonly loading: Signal<boolean>;
  readonly loaded: Signal<boolean>;
  readonly error: Signal<ApiError | null>;
  /** Starts (or restarts) the request. A failed reload keeps the last good data and sets `error`. */
  load(): void;
}

// Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
export function loadable<T>(request: () => Observable<T>, initial: T): Loadable<T> {
  const data = signal(initial);
  const loading = signal(false);
  const loaded = signal(false);
  const error = signal<ApiError | null>(null);

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    loaded: loaded.asReadonly(),
    error: error.asReadonly(),
    load() {
      loading.set(true);
      error.set(null);
      request().subscribe({
        next: (value) => {
          data.set(value);
          loaded.set(true);
          loading.set(false);
        },
        error: (failure: unknown) => {
          error.set(describeApiError(failure));
          loading.set(false);
        },
      });
    },
  };
}
