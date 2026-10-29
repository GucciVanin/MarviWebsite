# Decisions

- **Font: Inter Variable** (OFL 1.1), latin + latin-ext only, from `@fontsource-variable/inter` 5.3.0. Chosen for Latin-Ext coverage of pt-BR, a variable axis (one file serves every weight) and a licence that allows self-hosting. Details in `docs/design/fonts.md`. The `unicode-range` values are the package's own.
- **Fonts are static assets in `client/public/fonts`**, referenced by absolute `url('/fonts/...')` in `_fonts.scss`. They are not bundled by the build (no hash), so they cache by path; acceptable for a font that changes only on a deliberate update. nginx `font-src 'self'` needed no change.
- **Icon library:** `@lucide/angular` 1.64.0 (ISC licence, `sideEffects: false`). `<app-icon>` renders through `LucideDynamicIcon` with icon data taken from each icon class's static `icon` field, so only the icons listed in `icons.ts` are retained by the bundler. The accessible name sits on the `<app-icon>` host (`role="img"` + `aria-label`); the inner svg stays hidden from assistive technology, so the name is announced once.
- **Facebook and Instagram** are not in `@lucide/angular` (brand icons were removed upstream). They are two local `LucideIconData` objects in `icons.ts` in Lucide's stroke style.
- **Lucide names vs the order:** `home` -> `LucideHouse`, `filter` -> `LucideFunnel`, `alert-triangle` -> `LucideTriangleAlert`, `alert-circle` -> `LucideCircleAlert`, `check-circle` -> `LucideCircleCheck`, `loader` -> `LucideLoaderCircle` (the spinner); the kebab names the order asked for are kept as the app's public names. WhatsApp uses `message-circle`.
- **Styles:** every existing class keeps working. New behaviours are opt-in or purely additive: `.btn--icon`, `.card--interactive`, `.field__control`, `.alert:has(> app-icon)` (an alert without an icon stays plain flowing text, so no existing alert changes layout). Only `transform`, `opacity` and colour/shadow transitions; the global unclassed-link hover is scoped with `:where(a:not([class]))` so classed links are not affected. New duration token `--motion-press` is zeroed under reduced motion.
- **Heading sizes** now come from the type-scale tokens (h1 max 3.5rem instead of 3.25rem, weight 800 instead of 900; tighter tracking).
- **Id collision (resolved):** the series first used MRV-4.x, which already names older backlog stories. The Captain renumbered the revamp to MRV-7 (7.1 to 7.4, issues #41 to #44).

## Bundle (AC-5, production build, gzip -9 of all `.js` + `.css` in `dist`)
- Before: initial 90.88 kB (Angular estimate), all js+css 177,975 B.
- After: initial 92.02 kB (+1.14 kB), all js+css 179,222 B (+1.25 kB). The growth is the CSS (`styles` 1.63 -> 2.77 kB).
- No page imports `<app-icon>` yet, so the icon code and the 36 icon definitions are tree-shaken out and not counted. Cost once used (slice 7.2) is an estimate, not a measurement: roughly 10 to 15 kB raw / 4 to 6 kB gzipped. Fonts are separate requests, not in the JS/CSS total: latin 48 kB, latin-ext 85 kB (woff2, already compressed), loaded on demand.
- Total expected growth stays well under the 60 kB gate; to be re-measured in 7.2 when icons are used.

## Not verified
Existing pages were not viewed in a browser with the new font, type scale and button/field states.
