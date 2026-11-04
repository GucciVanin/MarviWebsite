# Testing report MRV-9.9 (issue #61)

Verdict: **PASS**. Final uncommitted change set; no source edited, nothing committed. Environment: Windows 11 Pro 10.0.26200, dotnet 10.0.300, host node 22.15 (client suite in Docker node:24), Playwright image 1.49.1, femtopixel/google-lighthouse. Docker jobs ran one at a time. The admin password was never printed (scripts read deploy/.env at run time). No write to the dev DB: the dev stack was stopped with `down` (never `-v`) and restored with `up -d --build` (api healthy, client and postgres up, `deploy_*` volumes untouched).

| # | Check | Expected | Result (x3 unless noted) | Verdict |
|---|---|---|---|---|
| 1 | `dotnet test test/Marvi.Tests` | 774, exit 0 | 774 passed, 0 failed, exit 0, three identical runs | PASS |
| 2 | `bash test/client.sh` (alone) | 1481, 80 files, NG_EXIT=0, no Errors | 80 files, 1481 passed, NG_EXIT=0, script exit 0, no Errors line, three identical runs | PASS |
| 3 | Layout fixtures | 25, 0 failed | `SELFTEST fixtures 25, failed 0`, exit 0 | PASS |
| 4 | Layout audit `bash test/layout/run.sh` (throwaway `marvi-audit`) | 0 over 368 loads, exit 0, nothing skipped | `total 0, pages 368, skipped []`, exit 0 | PASS |
| 5 | axe | 0 on 66 pairs | `checked 66, violations 0, skipped 0`, exit 0 (includes `/login#suspended` at 375 and 1280) | PASS |
| 6 | `bash test/bundle-size.sh` | ~236,810 B, under 300,000 B, exit 0 | **236,810 B** in 57 files (headroom 63,190 B), exit 0. First visit of `/` (reported, not gated): **124,300 B** in 4 files | PASS |
| 7 | Migration scripts (regression) | 15 / 12 / 15 / 8 | delivery 15 PASS, registration 12 PASS, addresses 15 PASS, numbering 8 PASS; 0 FAIL, exit 0 each. Port 55432 was free, so numbering ran as shipped | PASS |
| 8 | Runtime suite (dev stack down, then restored) | 443 pass, 0 fail | **443 passed, 0 failed, 4 notes**, exit 0, three runs. Suspended-customer section: 17 lines, identical in all three runs (every PASS line the same). The only difference is the informational NOTE with the measured seconds before the database change was noticed: 60 s, 61 s, 60 s (limit 60 s; the PASS line "noticed within 60 s" is the assertion). Not counted as nondeterminism | PASS |
| 9 | Lighthouse mobile, `/`, `/login`, `/contato`, 3 runs each | a11y 100, CLS 0 | accessibility 1.00 and CLS 0 on all 9 runs. Performance 0.66-0.69 on `/`, 0.72-0.73 on `/login`, 0.70-0.72 on `/contato` (not gated). Desktop preset not re-run | PASS |
| 10 | Layout audit at 200% text (`--text-zoom 2`), 320 and 375 | overflow-page, overflow-element, exceeds-parent, container-edge = 0 | 320: wrapped-control 152, covered-text 2 (identical x3). 375: wrapped-control 105, covered-text 3 (identical x3). No gated category. Exit 1 as designed (reported categories only) | PASS |

## Suspended customer, end to end (throwaway `marvi-audit` stack, seeded by `deploy/seed-demo.mjs`)
API script (admin credentials read from deploy/.env inside the script, never printed):
- Customer signs in, admin suspends (204). Login with the right password: 403, code `account_suspended`, message "Sua conta está suspensa. Entre em contato com a empresa.", no token. Wrong password: 401.
- Open token answers 403 `account_suspended` 160 ms after the suspend (same API process, so immediate; the 60 s bound for a change made behind the API's back is covered by the runtime suite: noticed at 60 to 61 s).
- Staff: `GET /api/employee/clients/{id}` returns 200 with status Suspended; the directory lists it as Suspended.
- Approve (204): sign-in works at once and the old token works again.

Browser (Playwright, pinned image): signed-in customer on `/portal`, suspended through the API, reload goes to `/login` with the "Sua conta está suspensa" alert (155 to 171 ms after the suspend) and the session token is cleared; signing in again shows the same message and stays on `/login`; after approve, sign-in reaches `/portal`. As staff, the suspended customer's page (`/employee/clientes/C-000004`) opens and shows the Suspenso status; the lookup widget opens on a suspended customer ("Situação Suspenso"). Scan of every element for a GUID in visible text, `href`, `title`, `aria-*`, `alt`, `id`, `data-testid` and the login page HTML: none. The browser script ran 4 times to completion with identical results.

## Observations (none a failure)
1. A scan that also included form `value` attributes found GUIDs on `/employee` in 7 `value` attributes of the order form while the default customer was Approved (the delivery-address selector option values, never shown, from MRV-9.6). With the customer Suspended there were none. Not part of this story and not visible text.
2. In one intermediate run of my own browser script (before I fixed a wrong customer-number field in it) the throwaway customer was left Suspended and the next run's sign-in timed out. Four later full runs, and the API script, restored the state correctly every time (final status Approved checked after each); I could not reproduce it and attribute it to the script edit, but note it.
3. Lighthouse was run with the mobile preset only (desktop was not re-run for this report).

## Cleanup
`marvi-audit` removed with its own `down -v` (its volumes gone). The runtime suite's own `marvi-runtime` project tore itself down (the `marvi-runtime_*` volumes remain as in earlier work items). Dev stack restored; dev database untouched.
