# MRV-9.5 Admin creates products from their portal

**Goal.** An admin can add a complete, sellable product from the admin portal in one guided flow: product data, structured specifications, price per tier and opening stock.

**Evidence (Captain, 2026-10-30, code read).** `POST /api/admin/products` and a product form exist in the admin Catálogo tab, but the form sits under the product table, takes specifications as one free-text box, has no price and no stock, so a created product shows "Sob consulta" and is out of stock until the admin visits two other tabs. Prices live in Preços (`ProductPricing` per tier) and stock in Operações (`InventoryRecord` per warehouse). There is no way to upload a photo (only an image URL).

**Decisions (Captain, reversible).**
- Keep the existing endpoints and extend the SPA: a prominent **"Novo produto"** button above the table opens a guided form (same page, as a panel). The existing inline form is replaced by it for create and edit.
- Specifications become structured rows: an "Atributos" editor with key/value rows (add, remove, suggestions for brand, unit, case quantity, volume, weight, certification) stored in the existing `Attributes` dictionary.
- The create flow can also set **initial prices per tier** (all tiers listed, price optional) and **opening stock per warehouse** (quantity, optional). It saves product, prices and stock in one request so a half-created product never exists: new endpoint `POST /api/admin/products/with-setup` (transaction, one audit entry per created row).
- Image: URL only, validated as `https` and previewed. File upload and storage are out of scope (no storage provider chosen).
- SKU: required, 3–40 characters, letters, digits, `-`, `_`, `.`, unique ignoring case; the form can suggest the next free SKU from the category prefix. The id is never shown (MRV-9.1).

## Acceptance criteria
- AC-1 The Catálogo tab opens with a "Novo produto" button above the product table; activating it shows a labelled panel (focus moves to its heading) with SKU, name, category (required for new products here), description, image URL with preview, active toggle, attributes editor, prices-by-tier table and stock-by-warehouse table; Cancel closes it and restores focus to the button.
- AC-2 `POST /api/admin/products/with-setup` (Admin only; 401/403 otherwise) creates the product, a `ProductPricing` row for each tier that has a price (> 0, ≤ 2 decimals, within `decimal(18,2)`) and an `InventoryRecord` for each warehouse that has a quantity (integer ≥ 0, ≤ 1,000,000), all in one transaction and audited; any failure rolls back everything and answers 400/409 with a field-level problem.
- AC-3 Validation, server and client alike, with pt-BR messages: SKU format and uniqueness (409 "SKU já existe"), name 2–200, category must exist, image must be an `https` URL ≤ 500, description ≤ 2,000, attributes: ≤ 30 rows, key 1–60 and value ≤ 200, no duplicate keys ignoring case, no blank rows saved.
- AC-4 After saving, the new product appears at the top of the table with a success message naming it, the panel closes (or resets for "Salvar e criar outro"), and the storefront shows it with its list price (the default tier) and stock when active; a spec/runtime check proves the storefront result.
- AC-5 Editing an existing product uses the same panel, pre-filled, for product data and attributes; prices and stock stay in their own tabs (linked from the panel) so one source of truth remains.
- AC-6 The panel is usable at 320 px and 200% text (tables inside `.table-wrap`), fields align on shared edges, the layout audit and axe stay at zero with the panel open (audit extended).
- AC-7 Duplicate protection: double-clicking Save creates one product (button disabled while busy); retrying after a network error does not create a second product (the SKU uniqueness answer is shown as "Este produto já foi criado").
- AC-8 API tests: success with and without prices/stock, each validation failure, rollback on a bad price after the product row is staged, duplicate SKU case-insensitive, 401/403; client tests: open/cancel/focus, attribute rows add/remove, validation messages, submit payload, busy state, error and success; runtime suite adds one with-setup create on real Postgres using throwaway data; suites pass three times.
- AC-9 `docs/tests/coverage-map.md`, `project.md` (endpoint table), `architecture.md` updated; the old free-text attributes input is gone and existing products' attributes load into the rows editor without loss (JSON round trip test).

## Out of scope
Image upload and storage, bulk create (the CSV import already exists), product variants, barcode/EAN lookup, deactivating or deleting (already done), per-warehouse reorder levels.

## Open questions
None.
