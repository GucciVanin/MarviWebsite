# decisions
- 2026-10-30 Captain: extends the existing Catálogo form and `POST /api/admin/products`; adds `POST /api/admin/products/with-setup` (one transaction, audited). Image URL only (https); no upload. Product ids are never shown (9.1); SKU is the visible reference.
- Standing notes from earlier Security reports: escape free text in outputs, ownership/roles on every path, rate-limit write endpoints with an existing policy shape, audit every write.
- Layout standard: audit 0, axe 0, 200% text gated categories 0, Lighthouse a11y 100.
