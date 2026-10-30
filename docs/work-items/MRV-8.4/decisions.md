# decisions
Slice 8.4 of MRV-8 (issue #49): admin portal. Goal: admin-portal at 0 for every rule at all eight widths; public groups, `form-*`, `card-height` and `box-sizing` stay 0.

## Result (measured, dev stack, client rebuilt with `docker compose ... up -d --build client`)
- Admin-portal: **157 to 0** at all eight widths (baseline: 64 `wrapped-control` on the first tab, 93 `exceeds-parent`/`overflow-element`/`overflow-page` from tables). Whole run 235 to **78** (employee 36, client 24, client-wholesale 18; all `exceeds-parent`, `overflow-element`, `overflow-page` at 320/375/414, 8.5). Public groups 0. Fixtures 19, 0 failed (audit untouched, no exemption added).
- Text zoom 200% (`--text-zoom 2`, 320 and 375): admin-portal **0 overflow**; 26 `wrapped-control` left, by design (below). Public groups unchanged at 67 `wrapped-control` + 6 `covered-text`.
- Client suite 1135 to **1136** (+1: the audit table sits in a `.table-wrap`). Bundle, gzip -9 per file over js+css (island excluded), from the built image: **200,068 B** (baseline 198,888 B, +1,180 B; gate 237,975 B). Lighthouse (Docker, dev stack): accessibility 100 and CLS 0 on home, storefront, contact, mobile and desktop (performance, not gated: mobile 69/67/70, desktop 98/97/98).

## Cause and fix (box model, no rule weakened)
- **Tables** (93 overflow findings): a `.table` is `width: 100%` with an intrinsic minimum wider than a phone card. Every admin table is now inside `<div class="table-wrap">` (`overflow-x: auto; min-width: 0; max-width: 100%`), so the card and the page keep the viewport width and the table scrolls inside its own box (AC-8). 16 tables in 7 templates; the import page has none. Cells `overflow-wrap: break-word`. `.table-wrap` has a bottom margin and row actions side by side (`td > .btn + .btn`) have a gap (they touched, and the form below a table touched the table). `.table-wrap` is shared CSS for 8.5; the `.table` additions (cell `overflow-wrap`, the action-button gap) also reach the employee and client tables, which have no wrapper until 8.5. Every `.table-wrap` is keyboard-focusable and named: `tabindex="0" role="group" aria-labelledby="<its card heading id>"` (axe `scrollable-region-focusable`: Testing found the two overview tables unreachable at 375 px). `role="group"`, not `region`: a region with the card's own name made `landmark-unique` fail on the audit page.
- **Tab strip** (64 `wrapped-control`): the "Pendências" tab (label + count badge) wrapped. `.tabs` is one row in its own scroll box (`flex-wrap: nowrap; overflow-x: auto`); tabs are `inline-flex; flex: none; white-space: nowrap` with a gap. On a phone the strip scrolls sideways (about 986 px of tabs). The focus ring is drawn inset (the box clips an outer ring); a negative margin to make room tripped `exceeds-parent` and was dropped rather than exempted. `.tabs` has `margin-bottom: var(--space-3)`: the routed page is an inline custom element, so the stack margin never reached it and tabs touched the first card (pre-existing, seen by eye).
- **200% text**: `.toolbar > h1,h2,h3 { min-width: 0 }` (a long heading beside an action shrinks and breaks). Form and toolbar buttons in the admin pages may wrap below 40em like the public hosts ("Salvar categoria" is wider than a 320 px card at 200%); buttons in table cells and the tab strip are excluded (`:not(td *)`, `app-admin-shell` not listed). A first version that included table buttons made row actions wrap at normal size (152 findings), which AC-8 forbids, so it was narrowed. This is the one deliberate admin wrap case.

## Accessibility (Testing, axe-core 4.10.2, wcag2a/aa, 21a/aa, best-practice, all 8 admin routes)
- Before (Testing): serious `scrollable-region-focusable` on /admin/visao-geral at 375 (this slice); `landmark-unique` on /admin/auditoria (this slice, from my first fix: role=region); `heading-order` on /admin/visao-geral (pre-existing: first card was an `h3` straight after the `h1`) and `empty-table-header` on /admin/precos (pre-existing: `<th></th>` over the default-badge column).
- Fixes: the group/tabindex/label pattern above on all 16 wrappers; the three overview cards are `h2` like every other admin card (visible change: the titles are now 2xl instead of lg; reversible); the empty header holds a visually hidden "Faixa padrão".
- After: axe 0 violations on all 8 routes at 375 and 1280. Admin audit 0, fixtures 19/0, client 1136 pass.

## Remaining at 200% text (reported, not gated)
- 26 `wrapped-control` at 320 and 375: 16 are the first tab (label and badge sit at different heights at that size, so the rule counts two lines; the tab does not wrap, the strip scrolls) and 10 are form/toolbar buttons that wrap by design. No overflow.

## Verified by eye (Playwright headless, same image as the audit, signed in as the admin; nothing submitted)
- All eight admin sub-pages at 320, 375, 768, 1280: no horizontal page overflow (scrollWidth equals the viewport on all 32); the tab strip scrolls at 320/375/768 and fits at 1280; tables scroll inside their box where wider (catalog 477 px in 243 at 320). Screenshots of inbox and catalog (320), operations (320 opened, 1280 opened) looked right.
- Click-opened editors ("Editar", "Ajustar estoque") on inbox, catalog, prices, operations, customers at the four widths: no page overflow (measured); screenshots of a subset.

## Not verified
- Lighthouse covers the public pages only, not the admin pages (accessibility of admin not measured). The inset focus ring on the active tab (2 px border over a 3 px inset ring) was not checked by eye.
- Dialogs, popovers and confirm bars: the admin pages have none (inline editors; native selects are browser-drawn). Long pt-BR validation messages (dev data produces none). Data volumes larger than the demo data. Real browser text size and zoom (emulated). Employee and client portals (8.5).
- The last additions (`.table-wrap` margin, `td > .btn + .btn` gap) are covered by the final full audit (admin 0) but not re-screenshotted.

## For the owner
- Phones scroll tables and the tab strip sideways instead of reflowing to stacked cards (a card layout would be a redesign, out of scope).
- Admin form buttons wrap at 200% text on phones.
