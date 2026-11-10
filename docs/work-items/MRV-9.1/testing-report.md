# Testing report MRV-9.1 (issue #52)

**Verdict: PASS.** Every gate met; all repeated runs identical (no nondeterminism).

## Environment
Windows 11 Pro 10.0.26200; dotnet 10.0.300; host node v22.15.0 (client suite runs in Docker node:24); gzip 1.14 (host CLI); Playwright image mcr.microsoft.com/playwright:v1.49.1-jammy. Uncommitted change set as handed over (Worker O-1..O-5, Security passed). Dev stack (4200/8080) rebuilt with `up -d --build` before the layout/bundle checks and restored the same way after the runtime suite. No records written to the dev DB; `down -v` never used.

## Results
| # | Test | Command | Result (runs) |
|---|---|---|---|
| 1 | API | `dotnet test test/Marvi.Tests` | 464 pass, 0 fail, 0 skipped, x3 identical |
| 2 | Client | `bash /tmp/ct.sh` (Docker node:24, run alone) | 66 files, 1185 pass, x3 identical |
| 3 | Layout fixtures | `bash test/layout/run.sh --fixtures` | SELFTEST fixtures 21, failed 0, x3 |
| 4 | Layout audit | `bash test/layout/run.sh` | total 0 violations, 216 pages, skipped [], exit 0, x3 (plus a 4th run after the stack rebuild: 0 / 216) |
| 5 | axe | `bash test/layout/axe.sh` | checked 28, violations 0, skipped 0, x3 |
| 6 | Bundle | gzip -9 per file (host gzip CLI) of js+css in the served dist, `island/` excluded, 50 files | 202,799 B x3 (gate 237,975 B; 35,176 B under) |
| 7 | Migration numbering | `bash test/runtime/migration-numbering.sh` | 8/8 PASS |
| 8 | Runtime suite | stack down, `bash test/runtime/run.sh`, stack up --build | 348 passed, 0 failed (3 notes), exit 0; dev stack restored, api and postgres healthy |

Bundle note: measuring with busybox gzip inside the nginx container gives 201,886 B (different compressor); the documented method (gzip CLI per file) gives 202,799 B, matching the Worker.

## O-5 check (employee quote price forms) against the dev stack
- Client spec suite (includes the employee-portal specs and the 2 new ones) passes 1185 x3.
- Headless Chromium (same pinned image as the audit), signed in with the demo employee through the API token, page `/employee`: queue shows two Submitted quotes (Q-000002, Q-000004) as `Cliente: Bar do Demo (C-000001)`, price tables and "Enviar preços" present; 3 `<form>` elements (two quote forms plus the customer lookup). Nothing submitted.
- GUID scan (regex over visible text and every non-class attribute): `/employee`, `/employee/historico` and `/` as employee: no GUID. 
- Observation (not a failure): `/storefront` and `/portal` have GUIDs only as `value` attributes of category `<option>` elements (the category filter/select), never in visible text, href, title or aria-*, which is what AC-4 / no-ids-on-screen scans. Not caused by this change as far as the Worker report shows (the category link now carries the name). Flagging for the Captain in case option values should count.

Scratch scripts used for the GUID scan live only in the session scratchpad; nothing in the repo besides this report was written.
