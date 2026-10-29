# Decisions

- **Icons are decorative everywhere in this slice.** Every control keeps its visible text or its existing `aria-label` as the accessible name (header links, menu toggle "Menu" with `aria-expanded`, "Entendi", send, footer social `aria-label`s, WhatsApp link `aria-label`). No icon got a `label`, so nothing is announced twice. Review stars keep the wrapper `role="img"` with the rating text.
- **Two new names in `icons.ts`:** `clock` (home "resposta" stat) and `arrow-left` (review carousel). Now 38 icons, still one typed file.
- **`icon-filled` class on `<app-icon>`** (`:host(.icon-filled) svg { fill: currentColor }`) fills the review stars; "off" stars only change `color`. The old spec selector `svg:not(.stars__off)` became `app-icon:not(.stars__off)` (same assertion, the class moved to the host).
- **Spinner:** global `.icon-spin` in `_components.scss`, rotating only inside `@media (prefers-reduced-motion: no-preference)`; with reduce, the `loader` icon is static. Used by `LoadState`, the contact send button and the coverage check while busy.
- **`ErrorAlert` and `LoadState` restyled in place** (shared with the portals): the error is now `div.alert.alert--error` with `alert-circle` and an outline small retry button with `refresh-cw`; text, `role="alert"`/`role="status"` and the retry output are unchanged. Portal specs pass unchanged. The portals' look of these two components changes (not viewed).
- **Product picker** (shared with the portals) got icons on its filter and add buttons only.
- **Footer and header link layout:** links that hold an icon are `inline-flex` with a 0.4rem gap; the footer's `svg` rule for the social links was removed with the inline SVGs.
- **Textarea leading icon** sits at the first line (`.contact__icon-top` in `contact.scss`), not vertically centred.
- **Spec helper:** `shared/ui/app-icon/testing/icon-names.ts` reads the `name` input of each `<app-icon>` in a fixture, so specs assert icon names, not markup.

## Bundle (AC-5 carried over, production build, gzip -9 per file, all `.js` + `.css` in `dist`)
- Slice delta: **about 12.3 kB gzipped** over the pre-revamp baseline (177,975 B): 190,249 B for all `.js` + `.css` in `dist`, measured the way the 7.1 figures were (without the React island `browser/island/ribbons.js`, 46,711 B, which this slice does not change and which is the same in both numbers). That is +11.0 kB over 7.1 (179,222 B).
- Initial: 99.91 kB (Angular estimate), +7.9 kB over 7.1 (92.02 kB). The icons are now really bundled (38 definitions plus the Lucide renderer); the 7.1 estimate of 4 to 6 kB gzipped was low by about a factor of two.
- Gate (<= 60 kB over the pre-revamp baseline): met with a wide margin.

## Not verified
Nothing was viewed in a browser: the alignment and spacing of icons in the header, footer, buttons and fields, the textarea icon position, the star fill, the spinner and reduced-motion behaviour, and the AC-12 check of no new console errors or 4xx/5xx on public routes are left to the Captain's browser pass.


## Counts and AC-9 notes
- **Specs:** the run went from 1053 (end of 7.1) to 1085, i.e. +32 (three consecutive runs, 61 files). Written by hand: 30 `it(` (24 in the first round, plus 6 after review: tests for the carousel arrows, review stars, footer account links, the busy spinners (contact, coverage check) and the product picker). The delta is not the number of `it(`: `app-icon.spec.ts` uses `it.each(Object.keys(ICONS))`, so adding `clock` and `arrow-left` to the map added 2 generated tests there. Real totals come from the run output (see the report), not from grepping `it(`.
- **AC-9 inline state icons:** the contact page shows `alert-circle` next to each field's error message and `check-circle` on the sent alert. Login and register have no field-level messages, only one form-level alert, which already carries `alert-circle`; no per-field icon was added there. A success icon on valid fields is intentionally not added (noisy; the sent alert has its `check-circle`).