# MRV-9.1 orders (issue #52)
Serves AC-1..AC-8. Constraints: no behaviour change besides numbers and removing GUIDs from the DOM; API JSON may still carry ids; no new dependency; layout audit and axe stay at 0; Lighthouse a11y 100; never wipe or write test data into the dev DB.

- O-1 (AC-1, AC-2) Domain + migration: `Number` on ClientAccount, Quote, Order (database-assigned sequences, unique, never reused; existing rows numbered by CreatedAt then Id), `Down`; DTOs expose `customerNumber`/`number` (quote summary also carries the company name, AC-6); by-number endpoints for employee and admin (success, 404, 400, 401, 403).
- O-2 (AC-3, AC-5, AC-6) SPA: one `customerNumber`/`documentNumber` pipe; use it in the employee queue (`Cliente: <empresa> (C-000042)`), lookup results, customer card, admin customers, admin inbox, order and quote views, audit table (entity column shows number for customer/quote/order).
- O-3 (AC-4) Client spec that renders every routed page with seeded GUID data and fails on a GUID in text, href, title and aria-* values.
- O-4 (AC-7, AC-8) API tests (migration numbering, uniqueness, endpoints), runtime-suite check on real Postgres, three identical runs, CONTEXT.md terms, project.md row MRV-9.1, architecture.md, coverage map.
