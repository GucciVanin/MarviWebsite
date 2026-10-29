import type { ViewTransitionInfo, ViewTransitionsFeatureOptions } from '@angular/router';
import { prefersReducedMotion } from './reduced-motion';

/**
 * Router hook for `withViewTransitions` (MRV-7.3, AC-13/AC-18): with reduced motion the transition is skipped, so the
 * new page simply replaces the old one. Where the View Transitions API does not exist the router never calls this and
 * navigation works as before.
 */
export function skipViewTransitionOnReducedMotion(info: ViewTransitionInfo, reduced: () => boolean = prefersReducedMotion): void {
  if (reduced()) {
    info.transition.skipTransition();
  }
}

/** What `app.config.ts` passes to `withViewTransitions`: no transition on the first load, none under reduced motion. */
export const VIEW_TRANSITION_OPTIONS: ViewTransitionsFeatureOptions = {
  skipInitialTransition: true,
  onViewTransitionCreated: (info) => skipViewTransitionOnReducedMotion(info),
};
