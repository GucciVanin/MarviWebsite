import { Subject } from 'rxjs';
import { loadable } from './loadable';
import { action } from './action';

describe('loadable', () => {
  it('shows the result of the request it asked for last, even when an older one answers after it', () => {
    const first = new Subject<string>();
    const second = new Subject<string>();
    const requests = [first, second];
    const list = loadable(() => requests.shift()!, 'none');

    list.load(); // e.g. filter A
    list.load(); // e.g. filter B, asked for right after
    second.next('B');
    first.next('A'); // the older answer arrives late

    expect(list.data()).toBe('B');
    expect(list.loading()).toBe(false);
  });

  it('ignores a late failure of a superseded request', () => {
    const first = new Subject<string>();
    const second = new Subject<string>();
    const requests = [first, second];
    const list = loadable(() => requests.shift()!, 'none');

    list.load();
    list.load();
    second.next('B');
    first.error(new Error('late'));

    expect(list.error()).toBeNull();
    expect(list.data()).toBe('B');
  });

  it('still loads normally, one request after another', () => {
    const one = new Subject<string>();
    const two = new Subject<string>();
    const requests = [one, two];
    const list = loadable(() => requests.shift()!, 'none');

    list.load();
    one.next('1');
    list.load();
    expect(list.loading()).toBe(true);
    two.next('2');

    expect(list.data()).toBe('2');
    expect(list.loaded()).toBe(true);
  });
});

describe('action', () => {
  it('forgets an old failure on request (so it is not shown next to something else)', () => {
    const request = action();
    const failing = new Subject<string>();
    request.run(failing);
    failing.error(new Error('boom'));
    expect(request.error()).not.toBeNull();

    request.reset();

    expect(request.error()).toBeNull();
  });

  it('with latestOnly, only the last request of a series is acted on (a quick second search wins)', () => {
    const request = action({ latestOnly: true });
    const first = new Subject<string>();
    const second = new Subject<string>();
    const seen: string[] = [];

    request.run(first, (value) => seen.push(value));
    request.run(second, (value) => seen.push(value));
    second.next('B');
    first.next('A');

    expect(seen).toEqual(['B']);
    expect(request.busy()).toBe(false);
  });

  it('without latestOnly, every request is acted on (saves must never be dropped)', () => {
    const request = action();
    const first = new Subject<string>();
    const second = new Subject<string>();
    const seen: string[] = [];

    request.run(first, (value) => seen.push(value));
    request.run(second, (value) => seen.push(value));
    first.next('A');
    second.next('B');

    expect(seen).toEqual(['A', 'B']);
  });
});
