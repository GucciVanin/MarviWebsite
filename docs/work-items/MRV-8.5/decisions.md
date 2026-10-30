# decisions
Slice 8.5 of MRV-8 (issue #50): employee and client portals, epic close. No exemption was added and no rule weakened.

## Result (measured, dev stack, client rebuilt with `docker compose ... up -d --build client`)
- Audit: whole run 78 to **0** at all eight widths, all nine groups (employee-portal 36 to 0, client-portal 24 to 0, client-portal-wholesale 18 to 0; pending and suspended stayed 0). By rule before: `exceeds-parent` 30, `overflow-element` 36, `overflow-page` 12 (320/375/414). Fixtures 19, 0 failed.
- Text zoom 200% (320, 375, all groups): 0 overflow everywhere; 122 reported, not gated: `wrapped-control` 116, `covered-text` 6 (public-notice). Before the fix the employee pages overflowed at 200% (page scroll 501 and 439 px at 320; client 350 and 330).
- axe-core 4.10.2 (`bash test/layout/axe.sh`, new, committed): 0 violations on 28 route/width pairs.
- Client suite 1136 to **1140** (+4: tables in focusable scroll boxes on the employee page, employee history, client page, product picker). Bundle, gzip -9 per file over js+css via the gzip CLI (island excluded), from the built image: **199,932 B** (baseline 200,359 B; gate 237,975 B). Lighthouse (Docker femtopixel/google-lighthouse, dev stack): accessibility 100 and CLS 0 on home, storefront, contact, mobile and desktop (performance, not gated: mobile 68/67/71, desktop 97/97/98).

## Cause and fix (box model)
- Tables (78 findings): same as 8.4. 9 tables in 3 employee/client templates plus the shared product picker are wrapped in `.table-wrap` with `tabindex="0" role="group"` and a unique name: the card heading, or an id on the card header's `<strong>` per quote/order (`queue-quote-<id>`, `history-item-<id>`, `quote-<id>`, `order-<id>`); the picker uses `aria-label` (new string `productPicker.catalogLabel`) because it can be used on a page more than once.
- Empty `<th></th>` over the action columns (picker, order basket, quote basket) now hold a visually hidden "Ações" (axe `empty-table-header`, found by the axe run).
- `.table-wrap { position: relative }`: an absolutely positioned visually hidden header escaped the scroll box and widened the page to 642 px at 200% text (seen in the text-zoom run, not at normal size).
- 200% text: `.btn` and `.chip` may wrap below 40em in `app-employee-portal`, `app-employee-history`, `app-client-portal`, `app-client-profile` and `app-product-picker` (not in table cells), the same rule as the admin hosts; `.toolbar > :is(strong, .muted) { min-width: 0; overflow-wrap: anywhere }` so a card header's id or address breaks.
- O-3: the portal shells (header, nav, one container) were already at 0 after 8.2/8.3/8.4; no further change. The portals have no dialogs or popovers (inline editors, native selects).
- `.visually-hidden` was defined twice (`_base.scss` with `clip-path`, `_components.scss` without); the `_components.scss` copy is removed (single source).

## By eye (Playwright headless, same image as the audit, demo logins from deploy/seed-demo.mjs; nothing submitted)
- employee `/employee`, `/employee/historico`, customer `/portal`, wholesale `/portal`, pending and suspended `/portal` at 320, 375, 768, 1280: page scroll width equals the viewport on all 40 loads; tables scroll inside their box where wider (e.g. 439 in 243 at 320).
- Click-opened states: employee customer lookup, selection and two products added to the order basket; customer and wholesale product picker with two products added to the quote cart; employee history switched to orders. All at the four widths: no page overflow (measured). Screenshots viewed: employee order form (320), customer cart (320), product picker (320 element crop).

## Not verified
- Only the dev demo data (short names and addresses); long real content only exercised by the 200% text run. Keyboard use of the scroll boxes was not driven (axe checks that they are focusable and named). Pending and suspended pages by measurement only, not screenshots. Real browser text zoom (emulated). Placing an order or requesting a quote was not exercised (it would write to the dev DB). axe ran on the pages in their default state (empty baskets); the cart states were measured for overflow only.

## For the owner
- At 200% text on phones, form and card-header buttons in the portals wrap onto two lines (by design, like the admin pages).
