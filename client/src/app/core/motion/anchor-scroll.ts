import { DOCUMENT } from '@angular/common';
import { EnvironmentProviders, inject, provideEnvironmentInitializer } from '@angular/core';
import { NavigationCancel, NavigationError, NavigationStart, Router, Scroll } from '@angular/router';

/** Set on <html> while a fragment navigation is being scrolled; the global CSS makes scrolling smooth only then. */
export const ANCHOR_NAV_CLASS = 'anchor-nav';

type Schedule = (callback: () => void) => void;
const nextFrame: Schedule = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => callback());
  } else {
    setTimeout(callback, 0);
  }
};

/**
 * Smooth scrolling is wanted for fragment links (#rede, #sobre, #por-que) but not for the router's scroll to the top on
 * a normal page change (that must be instant, under the view transition). So the class is set when a navigation to a URL
 * with a fragment starts and removed once the router has done its scroll (its Scroll event, plus one frame so the scroll
 * call has run; a smooth scroll already started keeps going) or the navigation was cancelled or failed. It never outlives
 * the navigation (MRV-7.3, AC-14).
 */
export function trackAnchorNavigation(router: Pick<Router, 'events' | 'parseUrl'>, root: HTMLElement, schedule: Schedule = nextFrame): void {
  router.events.subscribe((event) => {
    if (event instanceof NavigationStart) {
      root.classList.toggle(ANCHOR_NAV_CLASS, !!router.parseUrl(event.url).fragment);
    } else if (event instanceof Scroll) {
      schedule(() => root.classList.remove(ANCHOR_NAV_CLASS));
    } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
      root.classList.remove(ANCHOR_NAV_CLASS);
    }
  });
}

export function provideAnchorScrolling(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => trackAnchorNavigation(inject(Router), inject(DOCUMENT).documentElement));
}
