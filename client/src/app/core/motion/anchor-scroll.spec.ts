import { DefaultUrlSerializer, NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, Scroll } from '@angular/router';
import { Subject } from 'rxjs';
import { ANCHOR_NAV_CLASS, trackAnchorNavigation } from './anchor-scroll';

describe('trackAnchorNavigation (MRV-7.3)', () => {
  function setup() {
    const events = new Subject<unknown>();
    const serializer = new DefaultUrlSerializer();
    const router = { events, parseUrl: (url: string) => serializer.parse(url) } as unknown as Router;
    const root = document.createElement('html');
    const frames: Array<() => void> = [];
    trackAnchorNavigation(router, root, (callback) => frames.push(callback));
    const on = () => root.classList.contains(ANCHOR_NAV_CLASS);
    const flush = () => frames.splice(0).forEach((callback) => callback());
    return { events, root, on, flush };
  }
  const end = (id = 1, url = '/') => new NavigationEnd(id, url, url);

  it('is set when a navigation to a fragment starts and stays until the router has scrolled (one frame after Scroll)', () => {
    const { events, on, flush } = setup();

    events.next(new NavigationStart(1, '/#rede'));
    expect(on()).toBe(true);
    events.next(end());
    expect(on()).toBe(true);
    events.next(new Scroll(end(), null, 'rede'));
    expect(on()).toBe(true);
    flush();
    expect(on()).toBe(false);
  });

  it('is not set for a navigation without a fragment', () => {
    const { events, on } = setup();

    events.next(new NavigationStart(1, '/contato'));

    expect(on()).toBe(false);
  });

  it('is cleared when the navigation is cancelled', () => {
    const { events, on } = setup();
    events.next(new NavigationStart(1, '/#sobre'));

    events.next(new NavigationCancel(1, '/#sobre', 'guard said no'));

    expect(on()).toBe(false);
  });

  it('is cleared when the navigation fails', () => {
    const { events, on } = setup();
    events.next(new NavigationStart(1, '/#sobre'));

    events.next(new NavigationError(1, '/#sobre', new Error('boom')));

    expect(on()).toBe(false);
  });

  it('a plain navigation after a fragment one clears it at once (back/forward, initial load)', () => {
    const { events, on } = setup();
    events.next(new NavigationStart(1, '/#por-que'));

    events.next(new NavigationStart(2, '/storefront'));

    expect(on()).toBe(false);
  });
});
