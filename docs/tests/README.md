# Test commands (same for every run)

| Suite | Command | Notes |
|---|---|---|
| API | `dotnet test test/Marvi.Tests` | InMemory DB, no network |
| Client | `bash /tmp/ct.sh` (Docker node:24; host Node 22 is too old for the Angular CLI) | Vitest via ng test |
| Layout audit | `bash test/layout/run.sh` (dev stack up) and `bash test/layout/run.sh --fixtures` | Docker, pinned Playwright; see [layout-audit.md](layout-audit.md). Fails until MRV-8.5 clears the baseline |
| Runtime | stop the dev stack, `bash test/runtime/run.sh`, restart the dev stack | Real Postgres, own compose project |
| Migration delivery address (MRV-9.6) | `bash test/runtime/migration-delivery.sh` | Throwaway Postgres on 127.0.0.1:55436 (never the dev stack): the ten snapshot columns on quotes and orders, legacy rows untouched (an order keeps its free text), the link is `ON DELETE SET NULL` and the copy survives it, `Down` removes the columns and keeps the text, `Up` again |
| Migration registration (MRV-9.4) | `bash test/runtime/migration-registration.sh` | Throwaway Postgres on 127.0.0.1:55435; every existing customer becomes a Business account with no data, the CNPJ and CPF-hash unique indexes, `Down`. Notes for categorising real customers in production: `docs/operations.md` section 7 (an admin edits each person's account once: Clientes, Editar, Dados cadastrais, Conta pessoal) |
| Migration addresses (MRV-9.3) | `bash test/runtime/migration-addresses.sh` | Throwaway Postgres on 127.0.0.1:55434; legacy billing/shipping text becomes addresses flagged for review, one billing and one default per customer, `Down` restores the text |
| Migration numbering (MRV-9.1) | `bash test/runtime/migration-numbering.sh` | Throwaway Postgres container on port 55432 (never the dev stack); proves existing rows are numbered by creation time, the sequences continue and `Down` works |

Determinism: each suite runs three times per item; any difference is a fail "nondeterministic". Test data is pinned inside the tests (fixed dates and values; no random seeds in use). Environment is recorded in each report (OS, dotnet and node versions).

Reports: `docs/work-items/<id>/test-report.md`.

Note (MRV-8.5): run the client suite alone, not concurrently with other Docker jobs (a concurrent batch once returned a stale spec count).

Note (MRV-9.5): the runtime suite has a "PRODUCT WITH SETUP" section (guided create on real Postgres with throwaway data: rows, audit entries, storefront price and stock, refusals store nothing, ten simultaneous submits of one SKU leave one product with its own rows and no orphans).
