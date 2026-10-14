import { HERO_ISLAND_URL, loadHeroRibbons } from './hero-ribbons.loader';

describe('loadHeroRibbons', () => {
  const scripts = () => Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[data-island="hero-ribbons"]'));

  afterEach(() => {
    scripts().forEach((script) => script.remove());
    vi.unstubAllGlobals();
  });

  it('adds the island as a module script and settles once it has loaded', async () => {
    const done = loadHeroRibbons();
    const [script] = scripts();

    expect(scripts().length).toBe(1);
    expect(script.getAttribute('src')).toBe(HERO_ISLAND_URL);
    expect(script.type).toBe('module');

    script.dispatchEvent(new Event('load'));
    await expect(done).resolves.toBeUndefined();
  });

  it('does not load the island when the user asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));

    await loadHeroRibbons();

    expect(scripts().length).toBe(0);
  });

  it('settles quietly when the script cannot be loaded, and leaves nothing behind', async () => {
    const done = loadHeroRibbons();

    scripts()[0].dispatchEvent(new Event('error'));

    await expect(done).resolves.toBeUndefined();
    expect(scripts().length).toBe(0);
  });

  it('does not add the script twice', () => {
    loadHeroRibbons();
    loadHeroRibbons();

    expect(scripts().length).toBe(1);
  });
});
