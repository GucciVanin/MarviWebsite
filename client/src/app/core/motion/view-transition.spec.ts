import type { ViewTransitionInfo } from '@angular/router';
import { VIEW_TRANSITION_OPTIONS, skipViewTransitionOnReducedMotion } from './view-transition';

function info() {
  const skipTransition = vi.fn();
  return { skipTransition, value: { transition: { skipTransition } } as unknown as ViewTransitionInfo };
}

describe('skipViewTransitionOnReducedMotion (MRV-7.3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('skips the transition when the visitor prefers reduced motion', () => {
    const { skipTransition, value } = info();

    skipViewTransitionOnReducedMotion(value, () => true);

    expect(skipTransition).toHaveBeenCalledTimes(1);
  });

  it('lets the transition run otherwise', () => {
    const { skipTransition, value } = info();

    skipViewTransitionOnReducedMotion(value, () => false);

    expect(skipTransition).not.toHaveBeenCalled();
  });

  it('reads the real media query by default', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { skipTransition, value } = info();

    skipViewTransitionOnReducedMotion(value);

    expect(skipTransition).toHaveBeenCalledTimes(1);
  });

  it('does not skip where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { skipTransition, value } = info();

    skipViewTransitionOnReducedMotion(value);

    expect(skipTransition).not.toHaveBeenCalled();
  });
});

describe('VIEW_TRANSITION_OPTIONS (what app.config passes to withViewTransitions)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('skips the first load, and skips a created transition under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const skipTransition = vi.fn();

    expect(VIEW_TRANSITION_OPTIONS.skipInitialTransition).toBe(true);
    VIEW_TRANSITION_OPTIONS.onViewTransitionCreated!({ transition: { skipTransition } } as unknown as ViewTransitionInfo);

    expect(skipTransition).toHaveBeenCalledTimes(1);
  });
});
