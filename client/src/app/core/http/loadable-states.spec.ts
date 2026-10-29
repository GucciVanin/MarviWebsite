import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { PT } from '../i18n/pt-br';
import { action } from './action';
import { loadable } from './loadable';

const httpFailure = (status: number, error: unknown = null) => throwError(() => new HttpErrorResponse({ status, error }));

describe('loadable states', () => {
  it('starts idle with the initial value', () => {
    const list = loadable(() => of('x'), 'none');

    expect(list.data()).toBe('none');
    expect(list.loading()).toBe(false);
    expect(list.loaded()).toBe(false);
    expect(list.error()).toBeNull();
  });

  it('is loading, not loaded, until the answer arrives', () => {
    const pending = new Subject<string>();
    const list = loadable(() => pending, 'none');

    list.load();
    expect(list.loading()).toBe(true);
    expect(list.loaded()).toBe(false);

    pending.next('done');
    expect(list.loading()).toBe(false);
    expect(list.loaded()).toBe(true);
    expect(list.data()).toBe('done');
  });

  it.each([
    [0, PT.errors.network],
    [400, PT.errors.badRequest],
    [401, PT.errors.generic],
    [403, PT.errors.forbidden],
    [404, PT.errors.notFound],
    [500, PT.errors.server],
  ])('turns an HTTP %i into a pt-BR error and stops loading', (status, message) => {
    const list = loadable(() => httpFailure(status, { title: 'detail' }), 'none');

    list.load();

    expect(list.error()?.status).toBe(status);
    expect(list.error()?.message).toBe(message);
    expect(list.loading()).toBe(false);
    expect(list.loaded()).toBe(false);
    expect(list.data()).toBe('none');
  });

  it('keeps the last good data when a reload fails, and clears the error on the next try', () => {
    const answers = [of('good'), httpFailure(500), of('better')];
    const list = loadable(() => answers.shift()!, 'none');

    list.load();
    list.load();
    expect(list.data()).toBe('good');
    expect(list.error()?.status).toBe(500);
    expect(list.loaded()).toBe(true);

    list.load();
    expect(list.error()).toBeNull();
    expect(list.data()).toBe('better');
  });

  it('is not an error yet while a retry is in flight', () => {
    const answers = [httpFailure(500), new Subject<string>()];
    const list = loadable(() => answers.shift()!, 'none');

    list.load();
    list.load();

    expect(list.error()).toBeNull();
    expect(list.loading()).toBe(true);
  });
});

describe('action states', () => {
  it('starts idle', () => {
    const request = action();

    expect(request.busy()).toBe(false);
    expect(request.error()).toBeNull();
  });

  it('is busy until the answer arrives, then runs the follow-up with it', () => {
    const request = action();
    const pending = new Subject<number>();
    const seen: number[] = [];

    request.run(pending, (value) => seen.push(value));
    expect(request.busy()).toBe(true);

    pending.next(7);
    expect(request.busy()).toBe(false);
    expect(seen).toEqual([7]);
    expect(request.error()).toBeNull();
  });

  it('works without a follow-up', () => {
    const request = action();

    request.run(of(1));

    expect(request.busy()).toBe(false);
    expect(request.error()).toBeNull();
  });

  it.each([
    [0, PT.errors.network, null],
    [400, PT.errors.badRequest, 'Nome obrigatório'],
    [403, PT.errors.forbidden, null],
    [404, PT.errors.notFound, null],
    [409, PT.errors.conflict, 'Em uso'],
    [500, PT.errors.server, null],
  ])('turns an HTTP %i into a pt-BR error, with the server text as detail, and does not run the follow-up', (status, message, detail) => {
    const request = action();
    const followUp = vi.fn();

    request.run(httpFailure(status, detail), followUp);

    expect(request.error()).toEqual({ status, message, detail });
    expect(request.busy()).toBe(false);
    expect(followUp).not.toHaveBeenCalled();
  });

  it('turns a failure that is not HTTP into the generic error', () => {
    const request = action();

    request.run(throwError(() => new Error('boom')));

    expect(request.error()).toEqual({ status: 0, message: PT.errors.generic, detail: null });
  });

  it('forgets the previous failure when the next request starts', () => {
    const request = action();
    request.run(httpFailure(500));
    expect(request.error()).not.toBeNull();

    request.run(new Subject<string>());

    expect(request.error()).toBeNull();
    expect(request.busy()).toBe(true);
  });

  it('with latestOnly, a superseded failure is ignored too', () => {
    const request = action({ latestOnly: true });
    const first = new Subject<string>();
    const second = new Subject<string>();

    request.run(first);
    request.run(second);
    second.next('B');
    first.error(new HttpErrorResponse({ status: 500 }));

    expect(request.error()).toBeNull();
    expect(request.busy()).toBe(false);
  });
});
