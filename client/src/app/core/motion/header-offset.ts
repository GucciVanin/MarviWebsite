import type { ViewportScroller } from '@angular/common';

/** Space kept between the bottom of the sticky header and a fragment target. */
export const HEADER_GAP_PX = 8;

/**
 * Keeps the real height of the sticky header as the scroll offset (MRV-7.3, AC-14): `--scroll-offset` on <html> drives the
 * CSS `scroll-padding-top`, and the router's own fragment scrolling (which calls window.scrollTo and ignores CSS) gets the
 * same number through `ViewportScroller.setOffset`. The header is 136 px tall as two rows on desktop and one bar on a phone,
 * so it is measured, with a ResizeObserver, instead of guessed. Returns a function that stops observing.
 */
export function observeHeaderOffset(
  header: HTMLElement,
  root: HTMLElement,
  scroller: Pick<ViewportScroller, 'setOffset'>,
  observerType: typeof ResizeObserver | undefined = typeof ResizeObserver === 'function' ? ResizeObserver : undefined,
): () => void {
  const offset = (): number => Math.round(header.getBoundingClientRect().height) + HEADER_GAP_PX;
  const publish = (): void => root.style.setProperty('--scroll-offset', `${offset()}px`);

  scroller.setOffset(() => [0, offset()]);
  publish();
  if (!observerType) {
    return () => undefined;
  }
  const observer = new observerType(publish);
  observer.observe(header);
  return () => observer.disconnect();
}
