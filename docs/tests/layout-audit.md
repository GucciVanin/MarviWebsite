# Layout audit (MRV-8.1)

Spec: [MRV-8.0](../specs/MRV-8.0-layout-box-model.md) (AC-1 to AC-6, AC-11). A headless-browser measurement of every route at fixed widths; correctness of layout is proven by this script, not by eye.

## Commands

| What | Command | Notes |
|---|---|---|
| Audit the running dev stack | `bash test/layout/run.sh` | Needs the dev stack up (SPA 4200, API 8080). Read-only: it signs in with the seeded demo accounts and writes nothing to the database. Exit 1 on any violation, and also when any group was skipped (failed sign-in) or a route was redirected: unaudited pages never read as a pass. |
| Self-test of the rules | `bash test/layout/run.sh --fixtures` | Needs no stack. Fails unless every fixture in `test/layout/fixtures/` is flagged for its rule and `clean.html` passes. |
| Text zoom (emulation) | `WIDTHS=320,375 ONLY='^public' bash test/layout/run.sh --text-zoom 2` | Sets the root font size to 200% (`TEXT_ZOOM`), the way a text-size setting reaches rem-based CSS. An emulation: the em media queries (header collapse, tagline) do not scale as with a real setting. Reported, not gated. |
| Accessibility (axe-core 4.10.2) | `bash test/layout/axe.sh` | MRV-8.5. `test/layout/axe.mjs` in the same pinned Playwright image: signs in as the employee, the four customers (active, wholesale, pending, suspended) and, when `ADMIN_EMAIL`/`ADMIN_PASSWORD` or `deploy/.env` supply it, the admin; runs axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) on every portal route at 375 and 1280 (`WIDTHS`, `ONLY` narrow it). Read-only; the demo passwords are the ones in `deploy/seed-demo.mjs`, the admin password only comes from the environment and is never printed. Exit 1 on any violation, redirect or failed sign-in. |
| Narrow a run | `ONLY='admin-portal /admin/catalogo' WIDTHS=375,1024 OUT_FILE=x.json bash test/layout/run.sh` | `ONLY` is a regex over "group route"; `OUT_FILE` lands in the gitignored `test/layout/out/`. |

Output: one tab-separated line per violation (`group  route  width  rule  selector  detail`, sorted), then `SUMMARY {json}` (totals per rule, group, width, route; `skipped` lists accounts that could not sign in or routes a guard redirected). The admin password is read from `deploy/.env` at run time and passed to the container through the environment; it is never printed or written. A violation is counted once per (group, route, width, rule, selector).

## Environment

Docker image `mcr.microsoft.com/playwright:v1.49.1-jammy` with `playwright@1.49.1` installed at run time (both pinned; Chromium as bundled with that release). Viewport width x 900, device scale factor 1, `prefers-reduced-motion: reduce` plus a style that disables animations and transitions, locale pt-BR, timezone America/Sao_Paulo. Each page: navigation to network idle, `document.fonts.ready`, the SPA rendered, skeletons gone, two animation frames. Widths 320, 375, 414, 768, 1024, 1280, 1440, 1920.

Route groups (who is signed in): `public` (anonymous, privacy notice dismissed), `public-notice` (anonymous, privacy notice left visible: `/`, `/storefront`, `/contato`, `/register`), `public-as-employee` (the signed-in header on `/`, `/storefront`, `/contato`), `client-portal` (Bar do Demo, Approved), `client-portal-wholesale` (Mercado Atacadão Demo), `client-portal-pending`, `client-portal-suspended` (all `/portal`), `employee-portal` (`/employee`, `/employee/historico`), `admin-portal` (the eight `/admin/*` pages). 27 group/route pairs, 216 page loads per run.

## Rules

| Rule id | AC | Fails when |
|---|---|---|
| `overflow-page` | 2 | `documentElement.scrollWidth > clientWidth` |
| `overflow-element` | 2 | a visible in-flow element is outside 0..viewport width and no ancestor clips or scrolls it |
| `fixed-outside-viewport` | 2, 9 | a fixed layer (notice, WhatsApp button) extends outside the viewport |
| `overlap` | 3 | two visible in-flow sibling boxes intersect (more than 1 px in both axes; multi-line inline elements and table parts are skipped) |
| `covered-text` | 3 | the centre of an element's first text run is covered by a non-ancestor box, tested at every 0.8-viewport scroll step; a sticky or fixed layer only counts at rest on a control or field (top of the page, or a layer anchored in the lower half at the bottom). MRV-8.2: at the top, a layer anchored in the lower half counts only when the page cannot scroll the element above it (`maxScroll < element bottom - layer top`); covered content that scrolling clears is reachable. At the very bottom of the page nothing is exempt |
| `wrapped-control` | 4 | a button, `.btn`, chip (`.chip`, `.chip--*`; not the `.chips` list that holds them, which is meant to wrap), tab, summary, header/nav link, or small icon + label pair has more than one text line, or its icon and label sit on different rows. Two narrow opt-outs (MRV-8.2): `.btn--wrap` skips the line count below 640 px only (the icon/label stacking check still applies) and `data-lockup` (a logo lockup: badge beside a stacked name and tagline) is judged per text run, so each run must still be one line |
| `button-row-height` | 4, 5 | same-kind controls in one row of one parent differ in height by more than 1 px (baseline alignment is not checked) |
| `form-left-edge` | 5 | stacked label/field blocks whose left edges are 1 to 24 px apart |
| `form-column-width` | 5 | stacked blocks with the same left edge and different widths (a block in a multi-field row is exempt: it is a column of that row) |
| `form-row` | 5 | fields in the same row differ in top or height |
| `card-height` | 5 | card-like blocks (border, shadow or background, at least 64 px tall, not inline) in one row of a grid/flex parent differ in height |
| `container-edge` | 5 | a direct child of a `main`/`section`/`article`/`.container`-like block starts off the parent's content edge and is not centred |
| `exceeds-parent` | 6 | an in-flow box extends outside its parent's content box and the parent is not a scroll container (`overflow: auto/scroll`); a taller child counts only when the parent has a set height and really overflows |
| `box-sizing` | 6 | computed `box-sizing` is not `border-box` (SVG and checkbox/radio inputs excepted) |
| `popover` | MRV-9.2 AC-5 | an open pop-up marked `[data-popover]` sticks out of the viewport sideways, is taller than the viewport, or intersects a visible fixed or sticky layer (header, privacy notice, WhatsApp button) at the scroll position the page was left in. Covered text under such a pop-up is intended and is not a `covered-text` finding; while the page is scrolled a pinned sticky box is not compared as a sibling by `overlap` |

Scrollable containers are exempt from overflow inside themselves. Known limits: an overlay with `pointer-events: none` is invisible to the covered-text check (it uses `elementFromPoint`); the sample is the dev demo data, so very long real content is not exercised.

## Self-test (MRV-8.1 O-2)

`test/layout/fixtures/` holds one deliberately broken page per rule (`covered-text` has a second one for a fixed bar at the page bottom, `wrapped-control` a second one for an icon stacked above its label a third for a lockup whose tagline breaks and a fourth for a `.btn--wrap` that still wraps at 640 px and wider) and two clean pages: `clean.html` (now also a chips row, a `.btn--wrap` button and a lockup) and `clean-fixed-bar.html` (a bottom bar over a link the page can scroll clear, and room at the end). At widths 375 and 1024 every broken fixture is flagged for its expected rule, the clean pages yield nothing, and every rule has a fixture (the self-test fails on an uncovered rule): 19 fixtures, 0 failed. Both clean fixtures were also run against the rules as they were before MRV-8.2 and failed there (`covered-text`, `wrapped-control`), so they do exercise the changes. The rules `overlap`, `fixed-outside-viewport`, `button-row-height` and `form-left-edge` fire only on fixtures; they have never fired on a real page.

## Baseline (2026-10-29, before any layout fix; MRV-8.1)

`bash test/layout/run.sh` against the dev stack: **1023 violations over 216 page loads, exit 1** (expected: this slice adds no fixes). Three consecutive runs produced byte-identical violation lists (md5 of the sorted lines equal), so the audit is deterministic here. A run takes about 2 min 40 s.

| Rule | Violations |
|---|---|
| wrapped-control | 478 |
| exceeds-parent | 166 |
| box-sizing | 96 |
| overflow-element | 70 |
| covered-text | 58 (all with the privacy notice visible) |
| form-row | 48 |
| form-column-width | 46 |
| overflow-page | 31 |
| card-height | 15 |
| container-edge | 15 |
| overlap, fixed-outside-viewport, button-row-height, form-left-edge | 0 |

| Group | Violations |
|---|---|
| admin-portal | 345 |
| public-notice | 195 |
| public | 166 |
| public-as-employee | 130 |
| employee-portal | 95 |
| client-portal | 42 |
| client-portal-wholesale | 34 |
| client-portal-pending | 8 |
| client-portal-suspended | 8 |

| Width | Violations |
|---|---|
| 320 | 161 |
| 375 | 151 |
| 414 | 144 |
| 768 | 85 |
| 1024 | 95 |
| 1280 | 129 |
| 1440 | 129 |
| 1920 | 129 |

Per group and route:

| Group | Route | Violations |
|---|---|---|
| admin-portal | /admin | 49 |
| admin-portal | /admin/auditoria | 34 |
| admin-portal | /admin/catalogo | 72 |
| admin-portal | /admin/clientes | 31 |
| admin-portal | /admin/importacao | 22 |
| admin-portal | /admin/operacao | 67 |
| admin-portal | /admin/precos | 34 |
| admin-portal | /admin/visao-geral | 36 |
| client-portal | /portal | 42 |
| client-portal-wholesale | /portal | 34 |
| client-portal-pending | /portal | 8 |
| client-portal-suspended | /portal | 8 |
| employee-portal | /employee | 35 |
| employee-portal | /employee/historico | 60 |
| public | / | 82 |
| public | /contato | 19 |
| public | /login | 14 |
| public | /privacidade | 15 |
| public | /register | 14 |
| public | /storefront | 22 |
| public-as-employee | / | 77 |
| public-as-employee | /contato | 25 |
| public-as-employee | /storefront | 28 |
| public-notice | / | 93 |
| public-notice | /contato | 32 |
| public-notice | /register | 27 |
| public-notice | /storefront | 43 |

Reading the baseline: the header links "Nossa Rede" and "Por que a Marvi" wrap to two lines (60 px against 36 px, also seen by hand in the built-in browser at 1920 px, not reproducible from the repo) on every route at 1280 px and wider, more links wrap when signed in, and the brand link wraps to three lines at every width; the portals' tables sit inside cards that are not scroll containers (`exceeds-parent`, `overflow-element`, `overflow-page` at narrow widths); the only `box-sizing` offender is `.stat__icon` on the home page (`content-box`, set in `home.scss`); select and input in the same toolbar row differ by about 3 px (`form-row`). Some findings may be judged intended by the owner (for example a tall form card beside a short info card in `card-height`); the later slices decide per finding, and AC-11 requires zero at the end, so a rule that is wrong is fixed in the audit, not ignored.

## After MRV-8.2 (2026-10-29): header, footer and public pages

`bash test/layout/run.sh` against the rebuilt dev stack: **305 violations over 216 page loads, exit 1** (final state after the return-worker pass) (the portals are 8.4 and 8.5). The three public groups are at **0 violations at all eight widths** (public 166 to 0, public-notice 195 to 0, public-as-employee 130 to 0). Three consecutive runs gave the same list (md5 of the sorted lines equal). No group was skipped.

| Group | Before | After |
|---|---|---|
| public | 166 | 0 |
| public-notice | 195 | 0 |
| public-as-employee | 130 | 0 |
| admin-portal | 345 | 212 |
| employee-portal | 95 | 45 |
| client-portal | 42 | 27 |
| client-portal-wholesale | 34 | 21 |
| client-portal-pending | 8 | 0 |
| client-portal-suspended | 8 | 0 |

Public groups per rule, before to after (each group alone): `wrapped-control` 91/64/63 to 0, `exceeds-parent` 28/19/27 to 0, `covered-text` 0/0/58 to 0 (public / public-as-employee / public-notice), `box-sizing` 32 each to 0, `card-height`, `container-edge` and `form-row` 5 each to 0. The portals' numbers moved only through shared CSS (the header, `.btn` and `.chip` `nowrap`, `.field` heights, `.card` padding); their own templates are untouched. Whole run by rule, as the final run prints it: `exceeds-parent` 94, `form-column-width` 46, `overflow-element` 69, `overflow-page` 32, `wrapped-control` 64. `.btn`/`.chip` are `nowrap` at every width in the portals too (HEAD had no `white-space` there); an unscoped wrapping variant gave 264 portal `wrapped-control`, so the wrapping below 40em is limited to the public hosts. Portal pages need a visual check in 8.4 and 8.5.

Return-worker pass (2026-10-29): the figures above are the final ones (305 violations; public groups 0). With `--text-zoom 2` at 320 and 375, the public groups have **no overflow** (`exceeds-parent`, `overflow-*` 0) and still report **67 `wrapped-control`** (labels that legitimately wrap at that size) and **6 `covered-text`** (the notice is taller than half the screen at 200% on 320 px, so it counts as a top-anchored layer over form labels). Those 73 are reported, not gated.

The target (AC-11) is zero violations at every width and route; reached in MRV-8.5 (see the last section).

## After MRV-8.3 (2026-10-29): forms and field alignment

`bash test/layout/run.sh`: **235 violations over 216 page loads, exit 1** (305 after 8.2). `form-column-width` 46 to 0 (admin 31, employee 9, client 3, client-wholesale 3); `form-row`, `form-left-edge`, `card-height` 0 (they already were on real pages). Public groups 0. Remaining by rule: `exceeds-parent` 70, `overflow-element` 69, `overflow-page` 32, `wrapped-control` 64 (portals, 8.4 and 8.5). By group: admin-portal 212 to 157, employee-portal 45 to 36, client-portal 27 to 24, client-portal-wholesale 21 to 18, the rest 0. Text zoom 2 at 320 and 375: no form rule; public groups 67 `wrapped-control` and 6 `covered-text` as after 8.2. Fixtures 19, 0 failed (no rule or fixture changed). Cause and fix: `docs/work-items/MRV-8.3/decisions.md`.

## After MRV-8.4 (2026-10-29): admin portal

`bash test/layout/run.sh`: **78 violations over 216 page loads, exit 1** (235 after 8.3). admin-portal 157 to **0** at all eight widths (93 table overflow findings: `exceeds-parent`, `overflow-element`, `overflow-page`; plus 64 `wrapped-control` on the first tab); public groups, `form-*`, `card-height` and `box-sizing` stay 0. Remaining (8.5): employee-portal 36, client-portal 24, client-portal-wholesale 18, all `exceeds-parent` 30, `overflow-element` 36, `overflow-page` 12 at 320, 375 and 414. Text zoom 2 at 320 and 375: admin-portal 0 overflow and 26 `wrapped-control` (16 first tab, 10 form buttons that wrap by design); public groups still 67 + 6. Fixtures 19, 0 failed. Cause and fix: `docs/work-items/MRV-8.4/decisions.md`.

## After MRV-8.5 (2026-10-29): employee and client portals, epic close

`bash test/layout/run.sh`: **0 violations over 216 page loads, exit 0** (78 after 8.4: employee-portal 36, client-portal 24, client-portal-wholesale 18; `exceeds-parent` 30, `overflow-element` 36, `overflow-page` 12, all at 320, 375, 414). Every group is at 0 at all eight widths and no rule was weakened or exempted; fixtures 19 passed, 0 failed. The cause was the same as the admin portal: the portal tables (`.table`, intrinsic width wider than a phone card) were not in a scroll container. Every table of the employee and client pages and of the shared product picker is now inside `<div class="table-wrap" tabindex="0" role="group">` named by `aria-labelledby` (the card heading, or a per-card id such as `queue-quote-<id>`, `history-item-<id>`, `quote-<id>`, `order-<id>`) or `aria-label` (the picker: "Catálogo de produtos"). Empty action column headers hold visually hidden "Ações" (axe `empty-table-header`). `.table-wrap` is now `position: relative`, so a visually hidden header text (absolutely positioned) is clipped with the table instead of widening the page.

Text zoom 200% (`WIDTHS=320,375 bash test/layout/run.sh --text-zoom 2`, all groups): **0 overflow in every group** (`exceeds-parent`, `overflow-*`) and **122 findings, reported not gated**: `wrapped-control` 116 (admin 26, public 23, public-notice 23, public-as-employee 21, employee-portal 11, client-portal 7, wholesale 3, pending 1, suspended 1; buttons in forms, toolbars and card headers wrap by design below 40em, as on the admin and public pages; the portal hosts joined that list in 8.5) and `covered-text` 6 (public-notice: the notice is taller than half the screen). Card-header names and dates (`.toolbar > strong, .muted`) break long words.

Accessibility: `bash test/layout/axe.sh` (axe-core 4.10.2): **0 violations** on 28 route/width pairs (employee 2 routes, four customer states on `/portal`, admin 8 routes, at 375 and 1280). Before the hidden header texts: `empty-table-header` (minor) on the product picker table, `/portal` for both approved customers.

Final record: audit run, `--text-zoom 2` run, axe run and fixtures were each run against the rebuilt dev stack (`docker compose -f deploy/docker-compose.yml up -d --build client`).

## After MRV-9.2 (2026-10-30): the customer lookup widget and page

A route written `/path#widget` is audited with the widget open: the first `button[aria-haspopup="dialog"]` is clicked and the page is audited once the dialog shows the customer (`employee-portal` group: `/employee#widget`, plus the pages `/employee/clientes/C-000001` and `/employee/clientes/C-999999`, the not-found state; the demo data has customers 1 to 4). New rule `popover` (above) and two fixtures (`popover.html` flagged, `clean-popover.html` clean: a pop-up over page text, with a sticky header and a scrolled page): 23 fixtures, 0 failed. `bash test/layout/run.sh`: **0 violations over 240 page loads** (30 group/route pairs). axe: `/employee#widget` and the two customer pages at 375 and 1280, **0 violations on 34 pairs**. Lighthouse (femtopixel/google-lighthouse): accessibility 100 and CLS 0 on home, storefront and contact, mobile and desktop.

## After MRV-9.3 (2026-10-30): address forms

Routes written `/path#step` now take three more steps (nothing is submitted): `address-add` (`/portal#address-add`: the customer's "Adicionar endereço" form open), `address-edit` (`/portal#address-edit`: the first address card's edit form) and `address-fix` (`/admin/clientes#address-fix`: the customers editor with its first address's fix form); the page is scrolled back to the top before it is audited so the sticky header covers nothing. `/register` always shows its address form. The address form is a CSS grid of equal columns (`.address-fields`), every field one column wide, so the `form-column-width` rule holds. New fixture `clean-address-form.html`: 24 fixtures, 0 failed. `bash test/layout/run.sh`: **0 violations over 264 page loads**; axe: **0 on 40 pairs**.

### Rule change (MRV-9.3 O-6): `container-edge` is scroll-aware

A child of a scroll container (`.table-wrap`, `isScroller`) is measured where it sits unscrolled: its left edge is taken as `left + parent.scrollLeft`. Moving keyboard focus into a form inside a scrolled table (the admin address fix at 320 and 375) scrolls the table sideways, and that is the user's scroll, not a layout miss. Nothing else is weakened: boxes that are not children of a scroller are measured as before. New fixture `clean-scrolled-table.html` (a wide table in a `.table-wrap` scrolled 80 px, must stay clean; with the shift removed it is flagged) and the existing `container-edge.html` is still flagged: 25 fixtures, 0 failed. The audit script no longer resets table scroll after opening a step.
