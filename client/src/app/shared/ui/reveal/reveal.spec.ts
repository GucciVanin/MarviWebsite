import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { REVEAL_ROOT_MARGIN } from '../../../core/motion/viewport';
import { REVEAL_DONE, REVEAL_PENDING, Reveal } from './reveal';

@Component({
  imports: [Reveal],
  template: `
    @if (shown()) {
      <div id="plain" appReveal>Plain</div>
      <div id="third" [appReveal]="3">Third</div>
      <div id="far" [appReveal]="40">Far</div>
    }
  `,
})
class Host {
  readonly shown = signal(true);
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) {
    FakeObserver.instances.push(this);
  }
  observe(element: Element): void {
    this.observed.push(element);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  unobserve(): void {}
  intersect(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

describe('Reveal directive (MRV-7.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeObserver.instances = [];
  });

  async function render(): Promise<{ fixture: ComponentFixture<Host>; root: HTMLElement }> {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }
  const plain = (root: HTMLElement) => root.querySelector<HTMLElement>('#plain')!;

  it('leaves the content visible, with no class, where IntersectionObserver does not exist', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { root } = await render();

    expect(plain(root).classList.contains(REVEAL_PENDING)).toBe(false);
    expect(plain(root).classList.contains(REVEAL_DONE)).toBe(false);
    expect(plain(root).textContent).toBe('Plain');
  });

  it('leaves the content visible under reduced motion, even with IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const { root } = await render();

    expect(plain(root).classList.contains(REVEAL_PENDING)).toBe(false);
    expect(FakeObserver.instances.length).toBe(0);
  });

  it('hides the element only once attached, then reveals it when it intersects', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { root } = await render();

    expect(plain(root).classList.contains(REVEAL_PENDING)).toBe(true);
    expect(plain(root).classList.contains(REVEAL_DONE)).toBe(false);
    expect(FakeObserver.instances.length).toBe(3);

    FakeObserver.instances[0].intersect(false);
    expect(plain(root).classList.contains(REVEAL_DONE)).toBe(false);

    FakeObserver.instances[0].intersect(true);
    expect(plain(root).classList.contains(REVEAL_DONE)).toBe(true);
  });

  it('shows an element that is already on screen when it attaches as it is: no hide, no fade', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300, height: 200 } as DOMRect);
    const { root } = await render();

    expect(plain(root).classList.contains(REVEAL_PENDING)).toBe(false);
    expect(plain(root).classList.contains(REVEAL_DONE)).toBe(false);
    expect(FakeObserver.instances.length).toBe(0);
    vi.restoreAllMocks();
  });

  it('hides an element that starts below the fold, then reveals it when it scrolls in (false, then true)', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 1500, bottom: 1700, height: 200 } as DOMRect);
    const { root } = await render();

    expect(plain(root).classList.contains(REVEAL_PENDING)).toBe(true);
    FakeObserver.instances[0].intersect(false);
    expect(plain(root).classList.contains(REVEAL_DONE)).toBe(false);
    FakeObserver.instances[0].intersect(true);
    expect(plain(root).classList.contains(REVEAL_DONE)).toBe(true);
    vi.restoreAllMocks();
  });

  it('observes with the same root margin as the count-up, so a stat tile and its number wake together', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    await render();

    expect(FakeObserver.instances[0].options?.rootMargin).toBe(REVEAL_ROOT_MARGIN);
  });

  it('reveals once: it stops observing after the first intersection', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { root } = await render();
    const observer = FakeObserver.instances[0];

    expect(observer.observed).toEqual([plain(root)]);
    observer.intersect(true);

    expect(observer.disconnected).toBe(true);
  });

  it('disconnects its observer when destroyed before it was ever seen', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { fixture } = await render();

    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();

    expect(FakeObserver.instances.every((observer) => observer.disconnected)).toBe(true);
  });

  it('passes the stagger index as --reveal-index, capped so a long list does not wait forever', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { root } = await render();

    expect(plain(root).style.getPropertyValue('--reveal-index')).toBe('0');
    expect(root.querySelector<HTMLElement>('#third')!.style.getPropertyValue('--reveal-index')).toBe('3');
    expect(root.querySelector<HTMLElement>('#far')!.style.getPropertyValue('--reveal-index')).toBe('8');
  });
});
