# Security report MRV-9.1

**Verdict: pass** (no high/critical). Reviewed the working tree as of this run; the concurrent layout/nit edits did not touch security-relevant code.

## Findings
1. Info/Low - `GET /api/admin/customers/by-number/{number}` and `GET /api/employee/clients/by-number/{number}`: authorization is `[Authorize(Roles="Admin")]` (new controller) and the existing class-level employee/admin attribute (EmployeeClientsController); anonymous gets 401, customer 403 via the same attributes the by-id routes use. Responses are the same DTOs as the by-id/list endpoints (no extra fields). Sequential numbers allow enumeration, but only by roles that can already list every customer, so no new exposure.
2. Info - Input handling: `CustomerNumbers.TryParse` accepts ASCII digits only (no sign, whitespace, unicode digits); overflow and zero map to 0 (404); non-digits give 400. Parameterized LINQ, no injection. Consequence: negative/overflow cannot throw.
3. Info - Customer-facing isolation: no customer endpoint accepts a customer/quote/order number. Customer quote/order reads are filtered by `ClientAccountId == User.ClientId()`; accept/reject load by id and return Forbid on owner mismatch (unchanged). New `Include(ClientAccount)` on customer queries only adds the caller's own number/company name. Numbers are guessable (sequential) but are not authorization tokens; ids remain unguessable GUIDs and ownership is enforced.
4. Low - Id GUIDs are still present in API payloads (and audit `Details` JSON for admins). Only the SPA hides them; this is a UX requirement, not an access-control one. No action.
5. Info - Migration: add nullable, backfill by `created_at`/`placed_at` then id, setval, then default/NOT NULL/unique index; no data loss; `Down` drops indexes, columns, sequences in a valid order. Table/sequence names are constants interpolated into SQL (no user input). Note: Down loses the numbers (expected), and sequences are not transactional, so gaps after rollbacks are possible (cosmetic).
6. Info - `test/runtime/migration-numbering.sh`: throwaway container `marvi-migration-check` on 55432 with a fixed throwaway password, a trap removes it on exit, no dev DB or dev volume touched. Port is published on all interfaces for the run duration (minor; could bind `127.0.0.1:55432`). Connection string with the password appears only in process args locally; acceptable for a test password.
7. Info - Audit DTO: adds `EntityNumber` (resolved by id for ClientAccount/Quote/Order, admin-only endpoint); the SPA's `withoutIds` strips GUID-valued properties from the rendered details. Nothing sensitive added. Low: the stripper drops any property whose string merely contains a GUID (display-only data loss, no security impact).
8. Info - SPA: storefront `?category=<Name>` is used only to look up a category in the already-loaded list (case-insensitive); unmatched values are ignored; the value is never rendered raw, written to HTML, or used for navigation, so no XSS or open redirect. Angular binding escapes. Home tile links use the category name via `routerLink` queryParams (encoded). No `innerHTML`/bypassSecurity added in the diff.
9. Info - Logging: no new logging of numbers, names or credentials.

## Nit (non-blocking)
- Bind the throwaway DB port to loopback in migration-numbering.sh.
