import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CountUp } from './count-up';

@Component({ imports: [CountUp], template: '<app-count-up [value]="value()" />' })
class Host {
  readonly value = signal<number | null>(1234);
}

describe('CountUp', () => {
  afterEach(() => vi.unstubAllGlobals());

  function render() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const text = () => (fixture.nativeElement as HTMLElement).textContent?.trim();
    return { fixture, text };
  }

  /** A fake IntersectionObserver the test can fire, and a manual animation clock. */
  function fakeBrowser() {
    let seen: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        seen = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect = disconnect;
    });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    const frame = (time: number) => frames.splice(0).forEach((callback) => callback(time));
    return { scrollIntoView: () => seen!(), frame, disconnect };
  }

  it('shows the number at once, formatted the Brazilian way, when the browser cannot observe visibility', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    expect(render().text()).toBe('1.234');
  });

  it('shows the number at once when the user asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    fakeBrowser();

    expect(render().text()).toBe('1.234');
  });

  it('carries the real number from the start, then replays it from zero once seen and stops at the real value', () => {
    const browser = fakeBrowser();
    const rendered = render();
    const { text } = rendered;
    expect(text()).toBe('1.234'); // what a screen reader or crawler reads before the animation

    const { fixture } = rendered;
    browser.scrollIntoView();
    browser.frame(1000); fixture.detectChanges();   // the first frame only sets the start time
    expect(text()).toBe('0');
    browser.frame(1400); fixture.detectChanges();   // about halfway through the animation
    const halfway = Number(text()!.replace('.', ''));
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1234);

    browser.frame(2000); fixture.detectChanges();   // past the end
    expect(text()).toBe('1.234');
    expect(browser.disconnect).toHaveBeenCalled();
  });

  it('shows a dash while the number is not known yet, and counts up when it arrives', () => {
    const browser = fakeBrowser();
    const { fixture, text } = render();
    fixture.componentInstance.value.set(null);
    fixture.detectChanges();
    expect(text()).toBe('—');

    browser.scrollIntoView();
    fixture.componentInstance.value.set(500);
    fixture.detectChanges();
    browser.frame(0); fixture.detectChanges();
    browser.frame(5000); fixture.detectChanges();

    expect(text()).toBe('500');
  });
});
