# PR notes MRV-9.5 (issue #56): admin creates products from the portal

What changes for the owner:
- Catálogo tab: a "Novo produto" button above the product table opens a guided panel: code (SKU, with "Sugerir código"), name, category (required), description, https image address with preview, active toggle, attributes as name/value rows (suggestions: marca, unidade, quantidade por caixa, volume, peso, certificação), a price per pricing tier and an opening quantity per warehouse (all optional).
- One request saves product, prices and stock together (nothing half-created), with one audit entry per row. "Salvar produto" closes the panel and lists the new product first with a notice; "Salvar e criar outro" keeps it open.
- Same panel edits an existing product (data and attributes); prices and stock stay in Preços and Operação (linked). The old free-text attributes box is gone; stored attributes load unchanged.
- Rules, also shown in pt-BR next to each field: SKU 3-40 characters (letters, digits, - _ .), unique ignoring case; name 2-200; image https only; at most 30 attributes without repeated names; price > 0 with 2 decimals; quantity 0 to 1,000,000.
- New endpoint `POST /api/admin/products/with-setup` (Admin, rate limited 30/min, `RateLimiting__ProductSetup__PermitLimit`). The old product create/edit endpoints now also enforce the image/attribute/description rules.
- Known limit: the nginx CSP blocks external images, so the image preview shows a fallback message; decide whether to allow `https:` in `img-src`.

Verification: API 752, client 1470, runtime suite 429/0 (run), layout audit 0/368, axe 0/66, 200% text no gated overflow, bundle 236,998 B (gate 237,975).

## Limits and decisions stated plainly (O-5)
- AC-8 "rollback after a bad price" is not literally testable: validation runs before anything is staged, so nothing is ever staged to roll back. Atomicity is proven by the single `SaveChanges` and by the Postgres burst test (10 simultaneous submits of one SKU: one product with its own rows, no orphans).
- "Newest first" in the product table is client-side and per session (the list API is unordered and has no creation date).
- SKU limits differ: new products 3-40 characters with the restricted alphabet; the old create/edit endpoints and existing products keep up to 64.
- The image address cannot be previewed or shown anywhere under the current CSP (`img-src 'self' data:`), and the storefront renders no product images at all. Owner decision: allow `https:` images and/or render them in the storefront.
- Bundle headroom is small: 237,190 B against the 237,975 B gate (785 B). Owner decision on the gate; lazy-loading would not lower the measured total.
- The CSV import still permits values the new rules refuse (long descriptions, http images, many attributes). Follow-up. Editing such an existing product through the old `PUT` is not blocked: the new description/image/attribute rules apply only to fields whose submitted value differs from the stored one (an unchanged value is kept as stored; rename, category and activate/deactivate always work). `POST` stays strict.
- Also in this round: null price/stock rows answer 400 naming `prices[i]`/`stock[i]`; at most 200 price and 200 stock rows; the description refuses invisible/bidi/separator characters (newline and tab allowed); the edit audit records the cleaned values; the panel forgets a lost-connection failure when the code is edited, and Cancel is disabled while a save is on its way.
