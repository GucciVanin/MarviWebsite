# Testing report MRV-9.2 (issue #53)

**Verdict: PASS.** Every suite matched its expectation and was identical across its runs. No source edited, nothing committed. Environment: Windows 11, dotnet 10.0.300, host node 22.15 (client suite in Docker node:24), Docker playwright v1.49.1 for layout, femtopixel/google-lighthouse. Note: unrelated `csanalyzer-*` containers were running on the host (other ports); none of this project's Docker jobs ran concurrently.

| # | Check | Runs | Result |
|---|---|---|---|
| 1 | API `dotnet test test/Marvi.Tests` | 3 | 465 passed, 0 failed, 465/465/465 |
| 2 | Client suite (`/tmp/ct.sh`, Docker node:24, alone) | 3 | 1229 passed, 68 files, identical x3 |
| 3 | Layout fixtures (`run.sh --fixtures`) | 3 | 23 fixtures, 0 failed x3 |
| 4 | Layout audit `run.sh` | 3 | 0 violations, 240 loads, skipped [], exit 0 x3 |
| 5 | axe `axe.sh` | 3 | 34 pairs checked, 0 violations, 0 skipped, exit 0 x3 |
| 6 | Bundle, gzip -9 per file (js+css, island/ribbons.js excluded), from the running dev client image | 3 | **208,539 B** x3 (gate 237,975; margin 29,436 B) |
| 7 | Runtime suite (dev stack `down` without -v, suite, then `up -d --build`) | 1 | 349 passed, 0 failed, 3 notes, exit 0; dev stack restored (4200 and 8080 answer 200) |
| 8 | Lighthouse home/storefront/contato, mobile+desktop | 3 | a11y 100 and CLS 0 on all 18 runs |

Bundle method detail: use `gzip -9 -n -c < file` (stdin, no name). `gzip -9 -c file` embeds the file name and gave 209,490 B (+951 B over 53 files); Node zlib gave 209,181 B. The documented figure is reproduced exactly with `-n`.

Lighthouse performance (recorded, not gated) varied slightly run to run, as expected from simulated throttling: mobile home 66/68/68, storefront 69/70/70, contato 71/70/70; desktop 98 everywhere. Accessibility and CLS (the gated values) were identical in all runs.

## Browser check, dev stack, demo employee (read-only, no form submitted)
- Queue button "Consultar cliente" opens a dialog: company (Bar do Demo), customer number C-000001, status Aprovado, tier Standard, contact e-mail cliente@demo.marvi.test, addresses, open quotes 2, open orders 2. Focus is inside the dialog. Link "Abrir página do cliente": href `/employee/clientes/C-000001`, `target=_blank`, `rel=noopener noreferrer`. No GUID in text or any attribute.
- Page `/employee/clientes/C-000001` (title "Cliente | MARVI"): company, number, status, tier, e-mail, addresses, quotes (Q-numbers) and orders (P-numbers). No GUID in body text, href, title, aria-* or alt.
- `/employee/clientes/C-999999`: "Cliente não encontrado" with the explanatory text and back link.

## Observations (not failures)
- The demo customer's page lists quote Q-000004 (10:08) and order P-000003 (10:07), created after the 09:44 seed. Not by this testing (runtime suite uses its own database, browser step was read-only); likely earlier manual or worker/captain use of the dev stack. The owner may want `bash deploy/reset-dev.sh --yes` before the PR if a clean slate is wanted. Not done by me.
- Runtime suite reports 3 notes (pre-existing informational lines).
