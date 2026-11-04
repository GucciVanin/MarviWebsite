# Worker report MRV-9.1 (issue #52)

**Verdict: complete**, with one environmental finding the Captain must decide on (layout audit, below). Nothing committed or pushed.

## Files changed
- Domain: `ClientAccount`, `Quote`, `Order` get `Number`.
- Infrastructure: `AppDbContext` (sequences `client_number_seq`, `quote_number_seq`, `order_number_seq` as column default, unique index; InMemory counter for tests), migration `20261030174218_CustomerQuoteOrderNumbers` (+ Designer, snapshot): adds the column empty, numbers existing rows by `created_at` (`placed_at` for orders) then `id`, sets the sequence, then default, NOT NULL, unique index; `Down` included.
- Api: DTOs (`ClientProfileDto`, `ClientSummaryDto`, `ClientOwnProfileDto`, `QuoteDto` with `From`, `QuoteHistoryItemDto`, `OrderDto`, `OrderHistoryItemDto`, `PendingCustomerDto`, `PendingQuoteDto`, `AuditLogEntryDto.EntityNumber`); `Include(ClientAccount)` on every quote/order query; `GET /api/employee/clients/by-number/{number}`; new `AdminCustomersController` (`GET /api/admin/customers/by-number/{number}`); `CustomerNumbers.TryParse`; audit controller resolves numbers.
- SPA: `shared/format/number.pipes.ts`; models; employee portal, history, client portal, client profile, admin customers, inbox, audit; element ids use numbers; storefront/home category link carries the category name (`?category=Name`) instead of the GUID (products wait for the categories only when the URL names one); audit details drop id values.
- Tests: `CustomerNumberTests.cs` (+12 incl. theory cases), matrix rows, `no-ids-on-screen.spec.ts` (27 specs), pipe/audit/inbox/customers/profile/portal/storefront/home spec updates, runtime `api-security.mjs` section, new `test/runtime/migration-numbering.sh`.
- Docs: CONTEXT.md, project.md (row + 2 endpoints), architecture.md, `docs/tests/README.md`, coverage maps.

## Verification
- AC-1/2/7 API: `dotnet test test/Marvi.Tests` 464 pass (448 before, +16).
- AC-1/7 migration on real Postgres: `bash test/runtime/migration-numbering.sh` (throwaway container, port 55432) 8/8 PASS (ordering, sequence continues, unique refused, Down, empty starts at 1).
- AC-7 runtime suite (dev stack stopped, then restored with `up -d --build`): 348 passed, 0 failed, incl. the new by-number section.
- AC-3/4/5/6 client: 1183 specs (1140 before, +43), three identical runs. The no-ids scan was mutation-checked (re-introducing `clientAccountId` in the queue header made it fail).
- Bundle (gzip -9 per file, js+css in dist, island excluded): 202,437 B (8.5: 199,932; gate 237,975). Build warns that `home.scss` exceeds its budget by 75 B (file untouched).
- axe (`test/layout/axe.sh`): 0 violations, 28 pairs. Fixtures: 19, 0 failed.
- **Layout audit: 2 violations, 216 loads.** Both `form-left-edge`, `/employee` at 320 px. Cause: the dev DB holds a second Submitted quote (number 4, created 17:08 UTC, not by this Worker) with two lines next to the one-line quote 2. I rebuilt the client with the old queue header and got the identical two findings, so they come from the data, not from this change. Not wiped (rule: owner asks for `reset-dev.sh`). The dev DB was migrated by the stack rebuild: customers 1-4 numbered by creation time.

## Reviewer
One round: `accurate`. Observations: (a) the audit finding above was verified against the old template as stated; (b) AC-7 migration numbering is covered by the runtime script/suite, not `dotnet test` (InMemory); (c) `admin-portal.html` (overview) still prints the raw entity name in its recent-audit list (no id leaks; could use `entityOf`); (d) the storefront snapshot of the URL category could apply a stale category if the query changes before categories settle (tiny window, filter only).

## Known gaps / deviations
- Layout audit not 0 in the current dev DB (data-driven, above); will be 0 after `bash deploy/reset-dev.sh --yes` or when the extra quote leaves the queue (Captain/owner decision).
- Old bookmarks `?category=<guid>` are now ignored (unfiltered list).
- No Lighthouse run.

## O-5 (return pass)
- **Layout defect fixed, audit now 0 over 216 loads** (was 2 `form-left-edge`, `/employee` 320 px). Cause: the queue's price inputs had no `<form>`, so the audit (and the DOM) grouped all quotes' fields in one section; a one-line quote's block is its whole card, a two-line quote's blocks are its rows, 22 px apart. Fix (template only, rule untouched): each queue quote's price table and send button are in their own `<form (ngSubmit)="sendPrices(quote)">` (inputs named `price-<line id>`, button `type="submit"`; Enter in a price field now sends too). Dev DB untouched, data as is.
- Fixtures: new `form-left-edge-queue.html` (one-line and two-line quote without forms: flagged) and `clean-queue-forms.html` (same, each in a form: clean). Fixtures 21, 0 failed. axe 0 on 28 pairs. Bundle 202,799 B (gate 237,975).
- Reviewer nits: admin overview's recent-audit list now shows `Cliente C-000042` (shared `auditEntityLabel`; new spec); storefront follows the URL while categories are pending (a category change or removal before they arrive is no longer overwritten by the stale one; new spec).
- Client suite 1185 specs (+2), three identical runs. API/runtime results above unchanged. Update to the project.md row: the layout-audit caveat no longer applies (audit 0).
