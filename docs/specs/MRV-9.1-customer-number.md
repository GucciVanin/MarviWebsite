# MRV-9.1 No internal ids on screen: a customer number instead

**Goal.** The browser never shows a database id (a GUID). People who need to name a customer use a short, human customer number.

**Evidence (Captain, 2026-10-30, code read).** The employee queue prints `Cliente: <GUID>` for every quote (`employee-portal.html:16`, `quote.clientAccountId`). Ids also travel in API payloads and would appear in any URL that opens a customer, so the new customer page (MRV-9.2) needs a non-id handle.

**Decisions (Captain, reversible).**
- "Client ID is for the backend" is read as: the GUID (`ClientAccount.Id`) is never rendered, never put in a URL, never shown in an error or a title. Ids may still travel in API JSON bodies and routes under `/api`, where the SPA uses them to call the backend.
- A **customer number** (`Número do cliente`, e.g. `C-000042`) is a business reference, not the id: a sequence assigned once at registration, unique, never reused, never edited. Staff read it out, customers see it on their own profile. It is a new column `ClientAccount.Number` (identity sequence, formatted by the SPA); existing rows are numbered by `CreatedAt` in the migration.
- The SPA addresses a customer by number where a URL is needed (`/employee/clientes/C-000042`). The API gets `GET /api/employee/clients/by-number/{number}` and `GET /api/admin/customers/by-number/{number}`; lookups by GUID stay for the SPA's internal calls.
- Order and quote ids are in the same position as client ids (GUIDs): they are not displayed either; quotes and orders get a number (`Q-…`, `P-…`) the same way (AC-5). Staff and customers use it to refer to a document.

## Acceptance criteria
- AC-1 `ClientAccount` has `Number` (positive integer, unique index, assigned by the database on insert, never changed); a migration numbers existing customers by `CreatedAt`, then `Id`. `ClientProfileDto`, `ClientSummaryDto`, `ClientOwnProfileDto`, the admin customer DTO and the quote/order DTOs expose `customerNumber`.
- AC-2 `GET /api/employee/clients/by-number/{number}` (Employee, Admin) returns the same body as `GET /api/employee/clients/{id}`; 404 for an unknown number; 400 for a non-numeric one; 401 anonymous, 403 for a customer. An equivalent admin endpoint exists for the admin customers tab.
- AC-3 The SPA formats the number as `C-` plus six digits in one pipe (`customerNumber`), used everywhere a customer is named: employee queue, lookup results, customer card, admin customers, admin inbox, order and quote views, audit table.
- AC-4 No rendered text, attribute value, `title`, `aria-label`, `href` or router URL in the SPA contains a GUID. A client spec renders every routed page with seeded GUID data and fails on the GUID pattern in the DOM text and in `href`/`title`/`aria-*` values (`/[0-9a-f]{8}-[0-9a-f]{4}-…/i`), with `value` attributes of `<option>`/`<input>` and `data-testid`s as the only allowed carriers.
- AC-5 Quotes and orders get `Number` the same way (`Q-000123`, `P-000045`, separate sequences); the pages that show a document use it, and the audit table shows the number instead of the entity id column when the entity is a quote, order or customer (other entities show their name).
- AC-6 The queue line reads `Cliente: <company name> (C-000042)`; the company name comes in the quote summary DTO so the SPA does not need a second request per row.
- AC-7 API tests cover the migration numbering, uniqueness, the by-number endpoints (success, 404, 400, 401, 403); runtime suite covers one by-number call on real Postgres. Client suite stays green three times in a row.
- AC-8 `CONTEXT.md` gains **Customer number** (and quote/order number); `project.md` and `architecture.md` are updated.

## Out of scope
Showing the number on invoices or e-mails (no such documents yet), letting the customer pick or change it, hiding ids inside API JSON, short URLs for products.

## Open questions
None.
