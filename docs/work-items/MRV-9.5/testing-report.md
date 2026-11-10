# MRV-9.5 testing report

Verdict: **PASS** (two observations below, neither a failure). Final uncommitted change set; no source edited, nothing committed. Environment: Windows 11, dotnet 10.0.300, host node 22.15 (client suite in Docker node:24), Playwright image 1.49.1, femtopixel/google-lighthouse. Docker jobs ran one at a time. The admin password was never printed or typed (scripts read it from deploy/.env inside the container). No write to the dev DB.

| # | Check | Expected | Runs | Result |
|---|---|---|---|---|
| 1 | `dotnet test test/Marvi.Tests` | 760 | 760 passed, 0 failed, 0 skipped, x3 | PASS |
| 2 | Client suite (Docker node:24, alone) | 1474 | 80 files, 1474 passed x3; "2 errors" x3, both in admin-customers.spec.ts (baseline, count stable) | PASS |
| 3 | Layout fixtures | 25/0 | 25 fixtures, 0 failed, x3 | PASS |
| 4 | `bash test/layout/run.sh` | 0 over 368, exit 0 | total 0, pages 368, skipped [], exit 0, x3, byte-identical output | PASS |
| 5 | `bash test/layout/axe.sh` | 0 on 66 | checked 66, violations 0, skipped 0, exit 0, x3 | PASS |
| 6 | Bundle, `gzip -9 -n -c` per js/css (island excluded), fresh `--no-cache` image build | gate 237,975 | **237,226 B** x3 (749 B headroom; Worker quoted 237,190, a 36 B difference in my measurement, consistent across 3 fresh builds) | PASS |
| 7 | migration-delivery / registration / addresses / numbering | 15 / 12 / 15 / 8 | 15, 12, 15 pass, 0 fail x3 each; numbering 8 pass x3 (port 55432 free, run as shipped) | PASS |
| 8 | Runtime suite (`run.sh`), dev stack down without -v | 429/0 | 429 passed, 0 failed, 3 notes, exit 0, x3; PRODUCT WITH SETUP section identical each run (15 PASS; the 10-simultaneous-submit test: statuses 201,409, one product, no orphans; md5 of the section equal x3; whole logs differ only by docker build noise) | PASS |
| 9 | Lighthouse (mobile) on /, /storefront, /contato, /privacidade, /register | a11y 100, CLS 0 | accessibility 1.00 on all 15 runs (3 each) plus 5 extra storefront runs; CLS 0 on all but one: storefront run 1 CLS 0.028 (extra 5 storefront runs: 0). Performance 0.67-0.74 (not gated) | PASS (observation 1) |
| 10 | `--text-zoom 2`, WIDTHS 320,375, all groups | gated 0 | 92 pages; only wrapped-control 261 and covered-text 5 (320: 157 = 155+2; 375: 109 = 106+3, as Worker); overflow-page, overflow-element, exceeds-parent, container-edge 0; byte-identical x3 (exit 1 only because the reported categories are non-empty) | PASS |

## Catálogo tab check on the throwaway stack (admin session from env, Playwright; screenshots in the scratchpad)
At 320 and 1280: the "Novo produto" button is visible above the table; clicking it opens the panel "Novo produto" with every field labelled (0 unlabelled controls), a prices table with one row per tier (Atacado, Standard (padrão)) and a stock table with one row per warehouse (CD São Paulo, CD Campinas), both inside `.table-wrap`, and the "Adicionar atributo" editor (attribute rows appear inside a `.table-wrap` once added). Page scrollWidth equals clientWidth in all states (before, panel open, edit open). Cancel closes the panel and focus returns to "Novo produto". An existing product (CERV-LAGER-600, Cerveja Lager 600ml) opens "Editar produto" in the same panel with its 2 attributes as rows, no price/stock tables and links "Preços" and "Operação (estoque)". No GUID in visible text, href, title, aria-label/describedby/labelledby, alt or placeholder.

## Observations
1. Lighthouse storefront CLS 0.028 in 1 of 9 runs (first run, all other runs 0; still "good" under 0.1). Not tied to this story (public pages are untouched apart from shared SCSS); looks like cold-start jitter. Not counted as nondeterminism of the suite, but note it against the strict "CLS 0".
2. A GUID appears only in the `value` attribute of the category `<select>` options (internal option values, not text, href, title or aria), in the panel and the edit panel. Not user-visible; same pattern as any select bound to ids.

## Notes
- Layout audit, axe, 200% text, Lighthouse and the panel check ran against the throwaway compose project `marvi-audit` seeded by `deploy/seed-demo.mjs`, removed with its own `down -v` (volumes gone). The dev stack was stopped without `-v` and restored with `up -d --build` (api healthy, client and postgres up; its volumes untouched). Leftover `marvi-runtime_*` volumes from the runtime suite remain as before.
- No run-to-run difference found in any suite.
