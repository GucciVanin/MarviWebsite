# Test commands (same for every run)

| Suite | Command | Notes |
|---|---|---|
| API | `dotnet test test/Marvi.Tests` | InMemory DB, no network |
| Client | `bash /tmp/ct.sh` (Docker node:24; host Node 22 is too old for the Angular CLI) | Vitest via ng test |
| Runtime | stop the dev stack, `bash test/runtime/run.sh`, restart the dev stack | Real Postgres, own compose project |

Determinism: each suite runs three times per item; any difference is a fail "nondeterministic". Test data is pinned inside the tests (fixed dates and values; no random seeds in use). Environment is recorded in each report (OS, dotnet and node versions).

Reports: `docs/work-items/<id>/test-report.md`.
