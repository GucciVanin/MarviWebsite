import { HEADER_GAP_PX, observeHeaderOffset } from './header-offset';

class FakeResizeObserver {
  static last: FakeResizeObserver;
  disconnected = false;
  observed: Element[] = [];
  constructor(readonly callback: () => void) {
    FakeResizeObserver.last = this;
  }
  observe(element: Element): void {
    this.observed.push(element);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

describe('observeHeaderOffset (MRV-7.3)', () => {
  function setup(height: number) {
    let current = height;
    const header = document.createElement('div');
    header.getBoundingClientRect = () => ({ height: current }) as DOMRect;
    const root = document.createElement('html');
    let offsetFn: (() => [number, number]) | null = null;
    const scroller = { setOffset: (value: unknown) => (offsetFn = value as () => [number, number]) };
    const stop = observeHeaderOffset(header, root, scroller, FakeResizeObserver as unknown as typeof ResizeObserver);
    return {
      root,
      header,
      stop,
      offset: () => offsetFn!(),
      resize: (h: number) => {
        current = h;
        FakeResizeObserver.last.callback();
      },
    };
  }

  it('publishes the measured header height plus the gap as --scroll-offset and as the router scroller offset', () => {
    const { root, offset } = setup(136);

    expect(root.style.getPropertyValue('--scroll-offset')).toBe(`${136 + HEADER_GAP_PX}px`);
    expect(offset()).toEqual([0, 136 + HEADER_GAP_PX]);
  });

  it('follows the header when it changes size (desktop two rows, phone one bar)', () => {
    const { root, offset, resize } = setup(136);

    resize(68);

    expect(root.style.getPropertyValue('--scroll-offset')).toBe(`${68 + HEADER_GAP_PX}px`);
    expect(offset()).toEqual([0, 68 + HEADER_GAP_PX]);
  });

  it('observes the header and disconnects when stopped', () => {
    const { header, stop } = setup(100);

    expect(FakeResizeObserver.last.observed).toEqual([header]);
    stop();
    expect(FakeResizeObserver.last.disconnected).toBe(true);
  });

  it('still sets the offset once where ResizeObserver does not exist', () => {
    const header = document.createElement('div');
    header.getBoundingClientRect = () => ({ height: 50 }) as DOMRect;
    const root = document.createElement('html');
    const setOffset = vi.fn();

    const stop = observeHeaderOffset(header, root, { setOffset }, undefined);

    expect(setOffset).toHaveBeenCalledTimes(1);
    expect(root.style.getPropertyValue('--scroll-offset')).toBe(`${50 + HEADER_GAP_PX}px`);
    expect(() => stop()).not.toThrow();
  });
});
