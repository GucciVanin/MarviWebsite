# Test commands (same for every run)

| Suite | Command | Notes |
|---|---|---|
| API | `dotnet test test/Marvi.Tests` | InMemory DB, no network |
| Client | `bash test/client.sh` (Docker node:24; host Node 22 is too old for the Angular CLI) | Vitest via ng test. Exits with the exit code of `ng test` itself and fails when the summary has an `Errors` line (see the note on unhandled errors below); run it alone |
| Bundle size (MRV-9.9) | `bash test/bundle-size.sh [image]` after `docker compose -f deploy/docker-compose.yml build client` | Gated total and reported first-visit figure; see Bundle size below |
| Layout audit | `bash test/layout/run.sh` (dev stack up) and `bash test/layout/run.sh --fixtures` | Docker, pinned Playwright; see [layout-audit.md](layout-audit.md). Fails until MRV-8.5 clears the baseline |
| Runtime | stop the dev stack, `bash test/runtime/run.sh`, restart the dev stack | Real Postgres, own compose project |
| Migration delivery address (MRV-9.6) | `bash test/runtime/migration-delivery.sh` | Throwaway Postgres on 127.0.0.1:55436 (never the dev stack): the ten snapshot columns on quotes and orders, legacy rows untouched (an order keeps its free text), the link is `ON DELETE SET NULL` and the copy survives it, `Down` removes the columns and keeps the text, `Up` again |
| Migration registration (MRV-9.4) | `bash test/runtime/migration-registration.sh` | Throwaway Postgres on 127.0.0.1:55435; every existing customer becomes a Business account with no data, the CNPJ and CPF-hash unique indexes, `Down`. Notes for categorising real customers in production: `docs/operations.md` section 7 (an admin edits each person's account once: Clientes, Editar, Dados cadastrais, Conta pessoal) |
| Migration addresses (MRV-9.3) | `bash test/runtime/migration-addresses.sh` | Throwaway Postgres on 127.0.0.1:55434; legacy billing/shipping text becomes addresses flagged for review, one billing and one default per customer, `Down` restores the text |
| Migration numbering (MRV-9.1) | `bash test/runtime/migration-numbering.sh` | Throwaway Postgres container on port 55432 (never the dev stack); proves existing rows are numbered by creation time, the sequences continue and `Down` works |

Determinism: each suite runs three times per item; any difference is a fail "nondeterministic". Test data is pinned inside the tests (fixed dates and values; no random seeds in use). Environment is recorded in each report (OS, dotnet and node versions).

Reports: `docs/work-items/<id>/test-report.md`.

Note (MRV-8.5): run the client suite alone, not concurrently with other Docker jobs (a concurrent batch once returned a stale spec count).

Note (MRV-9.9): the runtime suite has a "SUSPENDED CUSTOMERS CANNOT SIGN IN" section (throwaway customers on real Postgres: suspend, refused with the code, a wrong password indistinguishable, stale token refused at once, approve and sign-in works, and a status changed directly in the database noticed within 60 s of real time, which makes one run about a minute longer). A status changed with SQL behind the API's back is only seen after the cache expires: reinstate through `PUT .../approve` when a test needs it at once.

Note (MRV-9.8): the runtime suite has an "ONE PATH FOR PRODUCTS" section (real Postgres, throwaway data in its own database): the old create endpoint answers 404/405, create is still atomic (a bad row after the product row leaves no product, price, stock row or audit entry), edit refuses invalid data with field messages and stores nothing, a product built broken straight in the database can only be deactivated (IsActive alone) and any other edit is refused, the data check lists it, the import rejects a bad row in the dry run and the real import with line, SKU and field (and saves the good row of the same file nowhere). `client/src/app/features/admin-portal/catalog/product-rules.contract.json` is the table of limits and cases that BOTH `SingleProductPathTests` (API: every case through the rules, create, update and import) and `product-rules.contract.spec.ts` (client) read: a rule changed on one side only fails a test.

Note (MRV-9.5): the runtime suite has a "PRODUCT WITH SETUP" section (guided create on real Postgres with throwaway data: rows, audit entries, storefront price and stock, refusals store nothing, ten simultaneous submits of one SKU leave one product with its own rows and no orphans).

Note (CI unhandled errors): the client suite is green only with process exit code 0 and no `Errors` line in the Vitest summary. Vitest exits 1 on unhandled errors even when every test passes ("Test Files 80 passed, Tests 1474 passed, Errors 2 errors" is a FAIL). A helper that pipes the output through `tail` hides the exit code, so capture `$?` of `ng test` itself and grep the summary for `Errors`; never compare only pass counts. Never silence it with `dangerouslyIgnoreUnhandledErrors` or a global handler. A spec that flushes an incomplete payload (for example a customer profile without `registration`) makes the component's subscriber throw after the test ends: give every flushed response the full shape the real API returns.

## Bundle size (MRV-9.9)

- **Gate: the total.** The sum of `gzip -9 -n -c` per file over every `.js` and `.css` the client image serves, the hero island (`island/ribbons.js`, which has its own 60 KB budget in `client/island/check-size.mjs`) excluded, must stay at or under **300,000 B**. Owner decision of 2026-11-03: the cap was 237,975 B (the pre-revamp baseline 177,975 B plus the 60 kB of MRV-7.0 AC-5), which MRV-9.5 had nearly used up (236,998 B). `bash test/bundle-size.sh` measures it from the built image and exits 1 above the cap. Nothing else enforces it (CI does not build the bundle size gate; the Angular build's own `budgets` in `angular.json` are separate per-bundle warnings).
- **Reported, not gated: the first visit of `/`.** The same measure over only the files `index.html` loads up front (the scripts, the module preloads and the stylesheet: the initial chunks); lazy route chunks, fonts and images are not in it. The script prints it as a second line. Use it to see what a new visitor downloads before the page is interactive; it has no cap.
- Figures: MRV-9.9 build 236,810 B total (headroom 63,190 B under the new cap; 1,165 B under the old one), first visit of `/` 124,300 B in 4 files (main 58,222 + two shared chunks 53,266 and 6,984 + styles 5,828).
- Historical work-item notes that say "gate 237,975 B" were true when written.
