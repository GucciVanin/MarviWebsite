# Decisions

## What changed
- **Tokens/components (global, additive):** `--color-gold-700`, `--gradient-hero`, `--product-card-min`, `--tap-min`; `.eyebrow` default colour is now dark gold with `--inverse` (bright gold, for navy surfaces) and `--center` (gold rules either side); `.btn--lg`, `.btn--block`; `.chip` (toggle, `aria-pressed`) and `.chip--tag`; `.filterbar`, `.results-count`; `.product` cards redesigned (art slot + body); `.page-hero` band (CSS ring shapes in pseudo-elements, tricolour edge); a `max-width: 1023px` rule giving `.btn`, `.btn--small`, `.chip`, inputs and selects a 44 px minimum height. **Round 2:** that rule is scoped with `:is(app-header, app-home, app-storefront, app-contact, app-privacy, app-login, app-register)`, the hosts of the header and the public pages (public and portal pages share one shell in `app.html`, so a shell class would not separate them; the component host elements do). No portal template renders inside those hosts, so the portals' 64 `.btn--small` uses, tables, toolbars and tabs are untouched; I confirmed this by the selector (every portal screen lives under `app-client-portal`, `app-employee-portal` or `app-admin-portal`), not by a spec or in a browser. Portals still inherit the dark-gold eyebrow.
- **Hero shapes on phones (round 2):** below 640 px the text column spans the whole width, so `.hero__shapes` drops to opacity 0.22 and no text is legible over the red node (gold text over it was about 2.9:1); the desktop look (full opacity, masked fade towards the text) is unchanged.
- **Home:** hero on `--gradient-hero` with an inline SVG (dots pattern, rings, a red node) inside the aria-hidden `.hero__media`; CTAs are `.btn--primary .btn--lg` (arrow) and `.btn--ghost .btn--lg` (user-plus), so `.hero__actions` icons are still `['arrow-right', 'user-plus']`. The static ribbons remain the content of `<marvi-ribbons>` and its specs pass untouched. Flow steps are elevated cards (the gradient arrow shows between them), stats are glass tiles with an icon disc, category tiles get CSS ring art (`.tile__art`, aria-hidden), the banner gets an SVG shape layer and a primary CTA. `appReveal` use is unchanged (the `#rede` tile still reveals its children, not itself).
- **Storefront:** header band with the register / "Montar cotação" CTA as `.btn--primary .btn--lg`; the filter form is unchanged (search, select, submit, same `data-testid`s and behaviour) and gains a chip row below it (`pickCategory(id)` sets the category and runs `applyFilters()`, so the URL and request are the same as with the select); results count; product cards show an aria-hidden inline-SVG bottle/can on a per-card gradient, the code as a tag chip, price (or "Sob consulta") and the stock badge. `imageUrl` is still not rendered (no remote images). There is no pagination and no add-to-quote action on the public catalog today, so none was added or changed. The skeleton (`.skeleton-card--product`) has the same art + body structure and `min-height: var(--product-card-min)` as the card.
- **Contact / privacy / login / register:** contact and privacy sit under a `.page-hero` (the only h1) with the form and details as cards and the policy in one `article.card` with separated h2 sections; login and register wrap the existing card in `.auth-page` (soft brand backdrop, gold top edge, full-width primary button). No validation, field, id or behaviour changed. A sticky table of contents for the policy was **not** added: the existing privacy spec requires that the default render contains no `<a>`.
- **New copy:** only `storefront.resultOne` / `resultMany` ("produto" / "produtos"), for the results count the order asked for.

## Lighthouse (AC-24), measured by the Captain on the rebuilt dev site
- Accessibility **100** on home and storefront, mobile and desktop. Performance (recorded, not gated): mobile 44 / 39, desktop 75 / 76 (home / storefront as reported).
- CLS was 0.909 (mobile) and 0.585 (desktop); the only shift source was `app-root > app-footer`: the shell painted the footer before the lazy route content, then it jumped down.

## CLS fix (round 3, re-measured by the Captain after the fix: CLS 0 on home, storefront and contact, mobile and desktop; accessibility 100; performance mobile 68 (home), 64 (storefront), 70 (contact), desktop 98 on all three; LCP 5.0 to 5.3 s on mobile with Lighthouse's simulated throttling, recorded not gated)
- `app.scss`: `main` is `flex: 1 0 auto; min-height: 100svh` (100vh fallback). While the lazy chunk loads, and on every route change, the footer therefore starts below the first screen; when the page arrives it only moves further down, out of view, which Lighthouse does not count. The footer stays in the markup and DOM (not hidden, so SEO and no-JS are unaffected); nothing animates layout. The privacy notice and WhatsApp button are `position: fixed` and do not shift. Cost: very short pages (login) now have the footer one screen down.
- A jsdom spec cannot measure CLS. `app.spec.ts` pins the structure the fix relies on (routed `<main>` holds the outlet and `app-footer` is its next sibling in the shell). Whether CLS is now 0 is **not measured by me**; it needs the Captain's Lighthouse re-run.
- Decorative layers `.hero__media`, `.hero__shapes`, `.banner__shapes` and `.tile__art` got `pointer-events: none` (security hardening).

## Contrast (WCAG 2.1 AA, text >= 4.5:1), computed with a script (relative luminance; semi-transparent layers composited by hand). All listed pairs are >= 4.5:1; this is not a claim about every pair on the site
| Pair | Ratio | Result |
|---|---|---|
| body text #10162f on white / on paper | 17.83 / 16.64 | pass |
| muted text #4a5170 on white / paper | 7.77 / 7.25 | pass |
| eyebrow dark gold #8a5f00 on white / paper | 5.65 / 5.27 | pass |
| **old** eyebrow gold #f5b700 on white | 1.80 | **fail, fixed** (new `--color-gold-700`; bright gold kept for navy surfaces and fills) |
| gold #f5b700 on navy-900 / navy-700 / stat tile | 10.21 / 8.75 / 7.39 | pass |
| white on navy-900 / navy-700 / blue-600 | 18.39 / 15.76 / 8.99 | pass |
| button primary navy on gold-500 / gold-600 (hover) | 10.21 / 7.74 | pass |
| link blue-600 on white / paper | 8.99 / 8.40 | pass |
| hero subtitle #e6e9f5 on navy-900; page-hero lead #dfe3f2 on navy-700 / blue glow #1b2f7a | 15.18; 12.31 / 9.46 | pass |
| stat sub #d3d8ea on stat tile | 9.37 | pass |
| alert error / success; badge warn / ok / bad / default | 9.31 / 9.06; 7.31 / 9.06 / 9.31 / 15.87 | pass |
| placeholder text (70 % opacity) on white | 6.64 | pass |
| tile text white over gradient start + overlay (ESTIMATED, not sampled pixels). Round 2: the overlay is now navy 0.86 from 25 % down (was 0.78 from 35 %) and tile 4's gradient is #7d9230 to #2b3809 (was #9bb53a, which computed to 3.73:1 at the gradient start with a 0.35 overlay; tile 0 was 4.56:1). Worst case now, at the lightest gradient colour with the overlay at 0.46 where the text starts, six tiles | 7.11 / 10.49 / 8.26 / 8.96 / 7.82 / 13.73 | pass (estimate) |
| hero text over the decorative shapes | n/a | handled by the phone fade above, not by a ratio |
| footer text white on navy-900 | 18.39 | pass |

Only the eyebrow failed among the listed pairs. Observation, not changed: the review star icons are gold on white (1.80:1); they are non-text and pre-existing, and each rating also has a text label. Other portal screens that use gold text on light surfaces were not audited.

## Bundle (production build, gzip -9 per file, all `.js` + `.css` in `dist`, island `browser/island/ribbons.js` excluded)
- Round 3: 198,857 B: +3,258 B over 7.3 (195,599 B) and **+20,882 B (20.9 kB) over the pre-revamp 177,975 B**; gate (<= +60 kB) met. Initial chunk 103.84 kB (round 2 was 198,855 B) (Angular estimate; 102.95 kB after 7.3). No build warnings.

## Specs
- Client run: 1116 -> **1132**, +16 (round 3 adds the shell-structure spec in `app.spec.ts`), identical on three consecutive runs (65 files). New: storefront 6 (card art/chip, results count singular/plural, chips pressed/apply, chip pressed from the URL, no chips for an empty category list, header CTA), google-reviews 1 (`#avaliacoes` carries no reveal), load-state 1 (product skeleton), home 3 (hero/h1/decorative art, eyebrow variants, banner art; the anchors test now finds `appReveal` through the directive and asserts none of `#sobre`, `#por-que`, `#produtos`, `#rede` has it), contact 1, privacy 1, login 1, register 1. No existing assertion was changed or weakened.

- **Chip list label (round 2):** the chips `ul` keeps `aria-label` = "Categoria", the same text as the select's label. Left as is: they are two controls for one filter, a screen reader announces them as a list named Categoria next to a field named Categoria, which is accurate; a distinct name would need new copy. The results count stays `aria-live="polite"`.

## Not checked in a browser
The Captain's browser pass (375/768/1280, six public routes) reported no horizontal overflow, cards and hero rendering fine and a clean console; the round 2 fixes (phone hero fade, scoped 44 px rule, darker tile overlay) were not re-viewed. Still unmeasured by me: the 44 px targets, focus rings on the chips, product card/skeleton heights matching, tile text on real pixels, and AC-24 (Lighthouse). Originally listed as unchecked: no horizontal scroll at 375 / 768 / 1280 px (CSS was written mobile-first with `minmax`/`auto-fill` grids and `overflow: hidden` on the decorative layers, but this is unmeasured), the look of the hero shapes and mask fade, flow-arrow alignment with the new card padding (`top` is computed from the card padding), stat tile layout at 375 px, chip wrapping, product card/skeleton heights matching (both use `--product-card-min`; longer names make real cards grow), focus rings on the new chips, the 44 px targets, tile text contrast on real pixels, and AC-24 (Lighthouse accessibility >= 95, performance recorded) for home and storefront.
