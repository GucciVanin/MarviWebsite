/**
 * Loads the animated hero ribbons (MRV-2.3d), a separate React bundle built from client/island. This loader and the
 * <marvi-ribbons> element in home.html are the only places that know about it: delete both and the island is gone.
 * It never rejects. If the script does not load, the static SVG the page already contains stays as it is.
 */
export const HERO_ISLAND_URL = '/island/ribbons.js';

const SELECTOR = 'script[data-island="hero-ribbons"]';

export function loadHeroRibbons(): Promise<void> {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    return Promise.resolve();
  }

  const existing = document.head.querySelector(SELECTOR);
  if (existing) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = HERO_ISLAND_URL;
    script.dataset['island'] = 'hero-ribbons';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      script.remove();
      resolve();
    });
    document.head.appendChild(script);
  });
}

/** Runs `work` once the browser is idle, so the island never competes with the first paint. */
export function whenIdle(work: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(work, { timeout: 3000 });
  } else {
    setTimeout(work, 300);
  }
}
