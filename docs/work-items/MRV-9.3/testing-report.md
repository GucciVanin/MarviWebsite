# Testing report MRV-9.3 (issue #54)

**Verdict: PASS with one reported finding (text zoom 200%, not gated).** Every gated suite matched its expectation and was identical across its three runs. No source edited, nothing committed, nothing written to the dev DB, admin password never printed. Environment: Windows 11, dotnet 10.0.300, host node 22.15 (client suite in Docker node:24), Docker playwright v1.49.1, femtopixel/google-lighthouse. Unrelated `csanalyzer-*` and `n8n` containers were running on the host (other ports). Never two Docker jobs of this project at once.

| # | Suite | Runs | Result |
|---|---|---|---|
| 1 | API `dotnet test test/Marvi.Tests` | 3 | **523 passed, 0 failed** x3 |
| 2 | Client (Docker node:24, alone) | 3 | **1296 passed, 72 files** x3 |
| 3 | Layout fixtures | 3 | **25 fixtures, 0 failed** x3, exit 0 |
| 4 | Layout audit `run.sh` | 3 | **0 violations over 264 loads**, exit 0, `skipped: []` x3 |
| 5 | axe `axe.sh` | 3 | **0 violations on 40 pairs**, 0 skipped, exit 0 x3 |
| 6 | Bundle, `gzip -9 -n -c` per file, js+css, `island/ribbons.js` excluded, from the running client image | 3 | **217,338 B** x3 (gate 237,975; margin 20,637 B) |
| 7 | `migration-addresses.sh` / `migration-numbering.sh` | 3 | **15/15** and **8/8** x3, exit 0 |
| 8 | Runtime suite (`down` without -v, `run.sh`, `up -d --build`) | 3 | **362 passed, 0 failed, 3 notes** x3 |
| 9 | Lighthouse home / storefront / contato, mobile + desktop | 3 | **a11y 100, CLS 0 on all 18 runs** |
| 10 | Text zoom 200% (320, 375, all groups, 66 loads) | 2 | identical both runs; **see finding** |

Runtime suite: the address tests were identical in all three runs: 30 parallel creates = 19 x 201 + 11 x 409 and 2 rows in the table (the first by registration); 6 parallel same-place creates = 1 x 201 + 5 x 409 and one row; 6 parallel "billing and default" creates all 201 with exactly one of each remaining; parallel deletes 1 x 204 + 2 x 404; no 500 anywhere. The PASS/FAIL lines are identical between runs except the printed status sets of two older, intentionally timing-dependent admin race checks (they pass on "no 500s", and show `200` vs `200,409` for price upserts, and `201,204` / `204,400,409` / `201,204,409` for warehouse delete vs coverage add). That is not an address test and not a pass/fail difference; reported for transparency, not as nondeterminism of this slice. The dev stack was restored with `up -d --build` and is healthy (client 200 on 4200, API 200 on 8080).

Lighthouse performance (recorded, not gated): mobile home 68/70/69, storefront 69/70/69, contato 71/71/71; desktop home 98/97/98, storefront 96/98/98, contato 98 x3.

## Dev stack, read-only (no form submitted; sign-in only, demo accounts)
- Migrated legacy data via the API (`GET /api/client/profile`) for all four demo customers: each has its legacy address(es) as rows with `needsReview: true`, empty structured fields, the legacy text in `street`; the first is billing and default (`billingAddressKey` = `defaultDeliveryKey`). Bar do Demo has three (Endereço principal, de entrega 1, de entrega 2).
- Customer portal `/portal` (Bar do Demo): 3 address cards, "Complete este endereço" shown 3 times, no GUID in the visible text, hrefs, titles or aria-*. The only GUID-shaped values in the DOM are the `value` attributes of the 4 category `<option>`s (Cervejas, Refrigerantes, Águas, Energéticos): invisible, not address keys, not text/href/title/aria.
- Employee customer page `/employee/clientes/C-000001`: "Endereços", "Endereço de cobrança" and the three addresses listed; no GUID anywhere in text or attributes.
- Employee "Consultar cliente" widget: lists the billing address and "Endereço de entrega 1/2" with their text; no GUID in text/href/title/aria (same category `value`s only, from the page behind).

## Finding: text zoom 200% (`--text-zoom 2`, reported not gated)
Runs 2 (identical, byte for byte). Total **212** findings over 66 loads (8.5 baseline: 122 = wrapped-control 116 + covered-text 6, over the routes of that time, which did not include the new address states or the 9.2 customer page). Now: wrapped-control 168, exceeds-parent 36, overflow-page 4, covered-text 4.

Expectation "0 overflow" is **not met**:
- **overflow-page (4)**, both on the 9.2 employee customer page: `/employee/clientes/C-000001` scrollWidth 547 vs 320 and 557 vs 375; `/employee/clientes/C-999999` (the not-found state, which has no address UI at all) 439 vs 320 and 442 vs 375. The not-found page is outside 9.3; these are most likely 9.2 findings never zoom-tested (that page did not exist at the 8.5 baseline). Not verified against a pre-9.3 build (no source/stack edits allowed).
- **exceeds-parent (36)**: 24 on `/employee#widget` at 320 and 375: the lookup widget's `dl.lookup__facts` rows are 320 px wide (x 73..393) inside a narrower toolbar parent (9.2 widget, now with address rows; whether 9.3 added to it was not isolated). 12 on **9.3 UI**: `span.badge.badge--warn` (the "Complete este endereço" badge) in `app-address-summary` is 71.4..257.8 vs parent content 71.4..248.6 (9.2 px too wide) at 320, on `/portal` (+`#address-add`, `#address-edit`), the pending/suspended/wholesale portals and the employee customer page.
- **wrapped-control, new in 9.3 forms** (reported only): "Adicionar endereço" button (2 lines at 320/375), "Remover" buttons on each address card (320), the address form's "Salvar"/"Cancelar" small buttons (up to 3 lines at 320, 2 at 375, in add and edit), the profile "Salvar" button (320), and the register form's submit button (320, 375). Admin `#address-fix`: only the existing first tab (2 lines). The staff/ admin address editor otherwise added nothing new.
- **covered-text (4)** (notice over the first label at `/contato` and `/register`, 320/375): same class as before (privacy notice height at 200%), reported only; the baseline had 6.

Suggest a follow-up (not a blocker for gated criteria): make the needs-review badge wrap (`white-space: normal`/flex-wrap), let the lookup facts grid use `minmax(0, 1fr)`, and look at the page-level overflow of the employee customer page at 200% text.

## Notes
- The worker's reported numbers (API 523, client 1296, fixtures 25/0, audit 0/264, axe 0/40, bundle 217,338 B, runtime 362, migrations 15/15 and 8/8) were all reproduced exactly.
- Output files for audit/zoom runs live in the gitignored `test/layout/out/` (`tz1.json`, `tz2.json`).
