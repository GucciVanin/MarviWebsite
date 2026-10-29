import { whenIdle } from './hero-ribbons.loader';

describe('whenIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs the work when the browser is idle, waiting at most 3 seconds', () => {
    const requestIdleCallback = vi.fn((work: () => void) => work());
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    const work = vi.fn();

    whenIdle(work);

    expect(requestIdleCallback).toHaveBeenCalledWith(work, { timeout: 3000 });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not run the work before the browser says it is idle', () => {
    vi.stubGlobal('requestIdleCallback', vi.fn());
    const work = vi.fn();

    whenIdle(work);

    expect(work).not.toHaveBeenCalled();
  });

  it('falls back to a short timer where requestIdleCallback does not exist', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const work = vi.fn();

    whenIdle(work);
    expect(work).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
