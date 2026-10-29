import { Directive, ElementRef, afterNextRender, computed, inject, input, DestroyRef } from '@angular/core';
import { prefersReducedMotion } from '../../../core/motion/reduced-motion';
import { REVEAL_ROOT_MARGIN, isInReveal } from '../../../core/motion/viewport';

/** Class that hides the element (slightly low and transparent) until it first scrolls into view. */
export const REVEAL_PENDING = 'reveal';
/** Class added once it has been seen; the stylesheet plays the fade/rise and the element ends at its natural state. */
export const REVEAL_DONE = 'reveal--in';
const MAX_STEP = 8;

/**
 * Fades and lifts an element in the first time it scrolls into view (MRV-7.3, AC-16). `appReveal` takes an optional
 * stagger index, `[appReveal]="i"`. Content is never at risk: the element is only hidden after the directive has attached
 * in a browser that has IntersectionObserver and no reduced-motion preference; everywhere else (tests, old browsers,
 * reduced motion) nothing is added and it is simply visible. It reveals once, then stops observing.
 */
@Directive({
  selector: '[appReveal]',
  host: { '[style.--reveal-index]': 'step()' },
})
export class Reveal {
  readonly index = input(0, { alias: 'appReveal', transform: (value: unknown) => Number(value) || 0 });
  protected readonly step = computed(() => Math.min(Math.max(this.index(), 0), MAX_STEP));

  private observer: IntersectionObserver | null = null;

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => this.arm(element));
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  private arm(element: HTMLElement): void {
    if (typeof IntersectionObserver !== 'function' || prefersReducedMotion()) {
      return;
    }
    // Already on screen when it attaches (above the fold): show it as it is, with no hide-then-fade flash.
    if (isInReveal(element)) {
      return;
    }
    element.classList.add(REVEAL_PENDING);
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        element.classList.add(REVEAL_DONE);
        this.observer?.disconnect();
        this.observer = null;
      }
    }, { rootMargin: REVEAL_ROOT_MARGIN });
    this.observer.observe(element);
  }
}
