# MRV-9.8 One path for products: a single rule set and endpoint pair for create, edit and import

**Goal.** There is exactly one way a product is validated and saved, whether it is created in the panel, edited later or brought in by the CSV import, so the rules cannot drift and old data cannot slip around them.

**Owner input (2026-11-03).** On the old create/edit endpoints applying different rules from the new panel: "There should be only one path."

**Evidence (Captain, MRV-9.5).** `POST/PUT /api/admin/products` (legacy rules, SKU up to 64, lenient for unchanged fields) coexist with `POST /api/admin/products/with-setup` (strict rules); the CSV import (`AdminProductImportController`) has its own limits (no cap on description, attribute key 64, no attribute count or value limits, newlines allowed in values, case-sensitive key merge).

**Decisions (Captain, reversible).**
- One domain class (`ProductRules`, today `ProductSetupRules`) is the only validator; create, update and import all call it.
- Endpoints: **create** = `POST /api/admin/products/with-setup` (the legacy `POST /api/admin/products` is removed); **edit** = `PUT /api/admin/products/{id}` validated by the same rules over the whole product (the "validate only changed fields" leniency from MRV-9.5 is removed). One narrow, documented exception keeps broken old data manageable: a `PUT` whose only difference from the stored product is `IsActive` is accepted without re-validating the rest, so a product can always be deactivated. The Reviewer may challenge this.
- The CSV import is brought under the same rules: a row that breaks them is reported per row in the dry run and the real import and is not saved; the import template documents the limits.
- The strict SKU rule (3-40; letters, digits, `- _ .`; unique ignoring case) applies everywhere. Products already stored with a longer or different SKU, a long description, too many attributes or an http image are listed by a one-off data check (admin-only endpoint or documented SQL, whichever is smaller) to be fixed before the first production migration; nothing is silently rewritten.

## Acceptance criteria
- AC-1 `ProductRules` is the single validator, called by create (with-setup), update and the import; a test fails if another product validator appears (for example by checking that product controllers call only `ProductRules`).
- AC-2 `POST /api/admin/products` is gone (404/405); every caller (SPA service, tests, seed, runtime suite, docs) uses `with-setup`; `PUT /api/admin/products/{id}` validates the whole product with the same rules and answers `[{field, message}]`; the IsActive-only exception is covered by a positive test and a negative test (IsActive plus any other change on a broken product is validated).
- AC-3 The CSV import runs each row through `ProductRules`; failing rows are reported with row number, SKU and field messages in the dry run and the real import, never saved; the response and the admin import screen show them; the import's own limits are removed in favour of the shared ones; its docs and template are updated.
- AC-4 A documented data check lists stored products that break the rules (SKU, description, attributes, image) without changing them; tests build such rows directly and see them listed; `docs/operations.md` says to run it and fix before the production migration.
- AC-5 The product panel (create and edit) shows the same field messages from the API for both paths; no client-side rule differs from the server (shared constants documented; a spec compares them).
- AC-6 API tests: each rule through each of the three entry points (create, update, import) gives the same verdict for the same input (table-driven test); null and oversize cases; the removed endpoint; 401/403. Runtime suite on Postgres: import rejecting a bad row, edit refusing invalid data, create still atomic. Client specs updated; layout audit and axe rerun; three identical runs with exit code 0 and no "Errors" line from the client suite.
- AC-7 `project.md` (endpoint table), `architecture.md`, `docs/tests/coverage-map*.md` updated; behaviour changes listed in `docs/work-items/MRV-9.8/pr-notes.md`.

## Out of scope
Rewriting stored data, bulk edit, product versioning, per-field permissions.

## Open questions
None.
