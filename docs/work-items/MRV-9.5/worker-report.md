# Worker report MRV-9.5 (issue #56)

**Verdict: complete.** Nothing committed or pushed. Dev stack restored (`-p deploy up -d --build`, healthy; its volume was never touched, no `-v`, no row written). Admin password never printed.

## Files
- Domain: `Catalog/ProductSetupRules.cs` (all rules, pure).
- API: `Catalog/Contracts/CreateProductWithSetupRequest.cs`, `AdminProductsController` (`POST with-setup`; legacy POST/PUT apply the description, image and attribute rules), `Auditing/AuditLogger.cs` (`AuditedRow`, `TrySaveAsync(IReadOnlyCollection<AuditedRow>)`: one save, one audit entry per row), `Configuration/RateLimiting.cs` (policy `productSetup`, key `RateLimiting:ProductSetup`, default 30/60 s), `deploy/docker-compose.yml` and test factory (100000).
- SPA: `catalog/product-panel.{ts,html}`, `catalog/product-rules.ts`, `admin-catalog.{ts,html}` (button, notice, newest first, edit through the panel), `admin.service.ts`, `pt-br.ts`, `_components.scss` (`.product-panel`).
- Tests: `ProductWithSetupTests`, `ProductSetupRulesTests`, `RateLimitingTests`, `AuthorizationMatrixTests` row, `product-rules.spec.ts`, `product-panel.spec.ts`, `admin-catalog.spec.ts` (old product form tests moved), runtime section "PRODUCT WITH SETUP" + matrix + not-500 rows, layout `audit.mjs`/`axe.mjs` steps `product-new`, `product-errors`, `product-edit`.
- Docs: project.md (row + endpoint table), architecture.md, docs/tests (README, three maps, layout-audit), docs/operations.md.

## Per AC
- AC-1: product-panel.spec (button above the table, labelled panel, focus on heading, Cancel returns focus, all fields and both tables in `.table-wrap`).
- AC-2: ProductWithSetupTests (prices > 0, 2 decimals, range; qty 0..1,000,000; one save, audit per row, 401/403, rate limit 429); runtime on Postgres: rows, audit +4, storefront list price and in stock.
- AC-3: 35-case validation theory (field named, pt-BR, no value echo, nothing stored); 409 "SKU já existe." ; client `product-rules.spec`.
- AC-4: spec (notice names product, panel closes or resets, first in table); storefront proved in API test and runtime.
- AC-5: edit spec (pre-filled, attributes as rows, links to Preços/Operação, PUT body); old-style SKU kept.
- AC-6: by eye (Playwright image with the admin sign-in from env, not the built-in browser, to keep the password out of the transcript) at 320 and 1280 on the throwaway stack: opens, validates, no page overflow, focus correct. Layout audit **0 over 368 loads**; fixtures 25/0; axe **0 on 66 pairs**; 200% text at 320 and 375: wrapped-control (155, 106) and covered-text (2, 3) only, **zero** gated categories. An audit run first flagged 6 `form-column-width` at 768; fixed with a 3-column auto-fit grid, then 0.
- AC-7: busy disabled + second click sends one request (spec); runtime burst of 10 simultaneous submits: one 201, rest 409, no orphan rows; lost connection then 409 shows "Este produto já foi criado".
- AC-8: API **752** (+57) x3 identical; client **1470** (+30) x4 identical (the 2 pre-existing unhandled errors in admin-customers.spec are not counted as failures); runtime **429 pass / 0 failed** (+15; dev stack down without -v, restored).
- AC-9: docs updated; old free-text box removed; JSON round-trip tests (API and client).

## Bundle
`gzip -9 -n -c` per js/css, island excluded: **236,998 B** (was ~230,962; gate 237,975; only 977 B of headroom).

## Reviewer
Round 1: ACCURATE, 8 lows. Fixed: SKU maxLength 40 for new products, `aria-describedby` for the attribute problem. Accepted: server-error focus stays on the button; many `role=status` hints; legacy PUT/POST keep plain-string SKU conflict and no SKU/name format rule (existing endpoints kept); a stale edit panel can 404 after a delete elsewhere; client MAX_PRICE is a double (server 400 handled).

## Deviations and gaps
- Eye check done with Playwright (screenshots) rather than the built-in browser (it would need the admin password typed in).
- Image preview: nginx CSP is `img-src 'self' data:`, so an external https preview is blocked in the deployed stack and the panel shows a fallback message. Needs an owner decision (add `https:` to img-src) if a real preview is wanted.
- "Rollback after a bad price": everything is validated before staging, so nothing is ever staged; true DB atomicity is proven on Postgres by the burst test. InMemory cannot roll back.
- Lighthouse not re-run (public pages unchanged except shared SCSS).
- Legacy POST/PUT now refuse stored values that break the new image/attribute/description rules (an old product with such data must be fixed on next edit).
- Product list is unordered from the API; "newest first" is held client-side for the session.

## O-5 (return): Captain's order after Reviewer (2 mediums) and Security (3 lows)
Done, each with tests: (1) legacy `PUT` validates description/image/attributes only when changed (API tests: 2500-char description, 64-char key, 31 attributes, newline value, case-duplicate keys, http image can be renamed/deactivated, another invalid value refused; CSV-import-created product; client rules skip unchanged fields in edit mode); the attribute comparison is on cleaned dictionaries (Reviewer low). (2) null `prices`/`stock` rows and a null body answer 400. (3) 200-row caps, description format characters refused, audit of cleaned values (POST and PUT). (4) SKU edit (typing or "Sugerir código") resets the lost-connection flag; Cancel is disabled while busy (the simpler option); 3 new specs. (5) pr-notes.md states the limits plainly.
Re-run: API **760** x3 identical; client **1474** x3 identical (+2 pre-existing unhandled errors); runtime suite **429/0** (dev stack down without -v, restored); layout audit **0 over 368 loads**; fixtures 25/0; axe **0 on 66**; 200% text at 320: wrapped-control 155 + covered-text 2, at 375: 106 + 3, no gated category; bundle **237,190 B** (gate 237,975, headroom 785 B). The final one-line changes (cleaned attribute comparison, suggest resets the flag) were re-verified with API 760 and client 1474 only; the audits ran before them and those files do not affect layout. Dev stack rebuilt with the final code. Reviewer on the delta: ACCURATE; accepted lows: client `hasInvisible` is narrower than the server's rule (server answers by field), client checks the name's control characters on edit even if unchanged, null-row loop precedes the cap.
