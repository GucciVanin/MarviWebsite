import { Component, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';

const DURATION_MS = 800; // --motion-slow
const formatter = new Intl.NumberFormat('pt-BR');

/**
 * A number that counts up once, the first time it scrolls into view. With reduced motion, or a browser that cannot
 * report visibility, it simply shows the number. A number that is not known yet shows a dash.
 */
@Component({
  selector: 'app-count-up',
  template: '{{ display() }}',
})
export class CountUp {
  readonly value = input<number | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly shown = signal(0);
  private visible = false;
  private animatedFrom: number | null = null;
  private frame: number | null = null;
  protected readonly display = computed(() => (this.value() === null ? '—' : formatter.format(Math.round(this.shown()))));

  constructor() {
    effect(() => {
      const target = this.value();
      untracked(() => this.onValue(target));
    });
    afterNextRender(() => this.observeVisibility());
  }

  private motionAllowed(): boolean {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return typeof IntersectionObserver === 'function' && !reduced;
  }

  private onValue(target: number | null): void {
    if (target === null) {
      return;
    }
    // Until the number is seen (or when there is no motion) the page already carries the real value, so screen readers
    // and crawlers never read a placeholder zero; the animation only replays it from zero once it scrolls into view.
    if (this.motionAllowed() && this.visible) {
      this.animate(target);
    } else {
      this.shown.set(target);
    }
  }

  private observeVisibility(): void {
    if (!this.motionAllowed()) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        this.visible = true;
        const target = this.value();
        if (target !== null) {
          this.animate(target);
        }
      }
    });
    observer.observe(this.host.nativeElement);
  }

  private animate(target: number): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame); // a new value replaces an animation still running
    }
    const from = this.animatedFrom ?? 0;
    this.animatedFrom = target;
    let start: number | null = null;
    const step = (time: number) => {
      start ??= time;
      const progress = Math.min((time - start) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.shown.set(from + (target - from) * eased);
      this.frame = progress < 1 ? requestAnimationFrame(step) : null;
    };
    this.frame = requestAnimationFrame(step);
  }
}
