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
  // Only the request asked for last may change what is shown: a slow earlier answer (an old filter, a previous page) must not
  // overwrite a newer one.
  let latest = 0;

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    loaded: loaded.asReadonly(),
    error: error.asReadonly(),
    load() {
      const mine = ++latest;
      loading.set(true);
      error.set(null);
      request().subscribe({
        next: (value) => {
          if (mine !== latest) {
            return;
          }
          data.set(value);
          loaded.set(true);
          loading.set(false);
        },
        error: (failure: unknown) => {
          if (mine !== latest) {
            return;
          }
          error.set(describeApiError(failure));
          loading.set(false);
        },
      });
    },
  };
}
