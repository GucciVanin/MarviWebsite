import { WritableSignal, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Action, action } from '../../core/http/action';

/**
 * What an admin create/edit form needs besides its fields (MRV-2.4b.7): the validation problem to show, the "saved" notice and
 * the request in flight. Every admin form had its own copy of these three signals and of the steps around a save.
 * Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
 */
export interface FormFeedback {
  readonly problem: WritableSignal<string | null>;
  readonly saved: WritableSignal<boolean>;
  readonly action: Action;
  /** Takes the notices away: the start of a save attempt, or of editing another item. */
  clear(): void;
  /** Stops a save with a problem the admin can fix. */
  refuse(message: string): void;
  /** Sends the request; when it succeeds, runs `onSaved` (reset the form, reload the list) and shows the "saved" notice. */
  send(request: Observable<unknown>, onSaved: () => void): void;
}

export function formFeedback(): FormFeedback {
  const problem = signal<string | null>(null);
  const saved = signal(false);
  const request = action();

  return {
    problem,
    saved,
    action: request,
    clear() {
      saved.set(false);
      problem.set(null);
    },
    refuse(message) {
      problem.set(message);
    },
    send(call, onSaved) {
      saved.set(false);
      request.run(call, () => {
        onSaved();
        saved.set(true);
      });
    },
  };
}

/**
 * The two-step delete the admin screens use (an irreversible action needs a confirming click): `ask` marks the item, the
 * screen then shows "confirm / cancel", and `run` sends the delete. The request's own state (busy, refusal) is in `action`.
 */
export interface ConfirmedDelete {
  /** The key of the item waiting for its confirming click, or null. */
  readonly confirming: WritableSignal<string | null>;
  readonly action: Action;
  ask(key: string): void;
  cancel(): void;
  /** The confirming click: forgets the question, sends the delete and, on success, runs `onDeleted` (reload the list). */
  run(request: Observable<unknown>, onDeleted: () => void): void;
}

export function confirmedDelete(): ConfirmedDelete {
  const confirming = signal<string | null>(null);
  const request = action();

  return {
    confirming,
    action: request,
    ask: (key) => confirming.set(key),
    cancel: () => confirming.set(null),
    run(call, onDeleted) {
      confirming.set(null);
      request.run(call, onDeleted);
    },
  };
}
