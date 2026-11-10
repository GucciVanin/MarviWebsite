# Security report MRV-9.8 (one product path)

Reviewer: Security agent. Scope: uncommitted diff against `docs/specs/MRV-9.8-single-product-path.md`. Static review only (no stack run, no tests executed).

**Verdict: PASS (no High or Critical finding). 0 High, 2 Medium-Low (admin-only DoS amplification), 4 Low, 3 Info. Nothing blocks the merge; S-1 and S-2 are recommended before production.**

## What was checked and holds

- **Authorization.** `AdminProductsController` (create with-setup, PUT, GET list/id, data-check, DELETE) and `AdminProductImportController` (dry run and real) both carry class-level `[Authorize(Roles = "Admin")]`. `AuthorizationMatrixTests` lists `data-check`, `with-setup` and `import` as AdminOnly (401 anonymous, 403 for other roles). No `[AllowAnonymous]` was added.
- **Removed legacy POST.** The `[HttpPost]` on `api/admin/products` is deleted. No alias, no `MapFallback` in `Program.cs` (only `MapControllers`), so a POST to the base route gets 405 (GET still matches the route) and 401 for anonymous. `data-check` cannot collide with `{id:guid}` and `import` is its own literal route. `SingleProductPathTests.TheOldCreateEndpoint_IsGone` covers admin and anonymous.
- **One validator.** Create, PUT, import and data-check all call `ProductRules.Check`; the old `ProductSetupRules` is deleted. Limits are checked length-first (SKU, name, description, image URL are bounded before the regex or per-character scans), the SKU regex is ASCII-only and runs on the trimmed value (so `$` before a trailing `\n` cannot be abused). Control, line/paragraph separator and Format (zero-width, bidi, soft hyphen) characters are refused in name, attribute key and value, and in description except `\n \r \t`. Image URL: https only, no whitespace/control, no userinfo, 500 chars, so `javascript:`/`data:` are impossible.
- **Rule messages never echo the value** (`ProductRules` messages are constant strings). The data check therefore exposes only id, SKU, name and constant messages, and only to Admin.
- **IsActive-only exception cannot change other fields.** In that branch only `product.IsActive` is assigned; the request's other fields are discarded, so field order, null vs missing (both map through `AdminInput.Clean`, null equals empty) and duplicate attribute keys (collapsed by `SameAttributes`, compared with the stored side) cannot smuggle a change in. EF writes only the dirty column, so a concurrent edit of another field is not overwritten. Any difference at all (including SKU case) falls to full validation. The audit entry is still written in both branches.
- **Atomicity.** Import writes products, prices, stock, the lazily created default tier and the audit entry in one `SaveChangesAsync` (one implicit transaction) through `TrySaveAsync`; any validation error returns before anything is staged; constraint violations become 409 and nothing is saved. Dry run creates nothing. Create with-setup is the same (one save, one audit row per entity).
- **Number parsing.** `TryParseMoney` uses `InvariantCulture`, `AllowDecimalPoint` only (no sign, no thousands style, ASCII digits only), refuses more than two decimals, and the rule range-checks `0 < price <= MaxPrice`. Stock uses `NumberStyles.None`, so no sign/whitespace, and overflow fails. No culture dependence.
- **Injection.** All DB access is EF/LINQ (no raw SQL); SKU compare is `ToLower()` in the expression. Angular renders import errors by interpolation (no `innerHTML`/`bypassSecurityTrust*` in admin-portal). No CSV or spreadsheet export of products exists in `src`, so formula injection (`=`, `+`, `@`) has no sink today.
- **Request size.** Import is capped by `RequestSizeLimit(2 MB + 64 KB)` plus a `file.Length` check and 5000 rows; prices and stock rows are capped at 200 in the rules.
- **Rate limits.** `with-setup` keeps `ProductSetupPolicy`. PUT, import and data-check are unthrottled (see S-4).

## Findings

### S-1 (Medium-Low, admin-only) Import CPU amplification through the number of columns / attribute cells
- Location: `src/Marvi.Domain/Catalog/ProductImportPlanner.cs` (`Plan`, the per-row `columns.Keys.Where(StartsWith TierPrefix)` and `columns.Keys.Where(StartsWith AttributePrefix)` scans, and the `attributes.Keys.Where(... Trim ... OrdinalIgnoreCase).ToList()` loop run once per attribute cell); `ProductCsv.Read`.
- Risk: the 2 MB cap bounds bytes but not the column count. A header with about 100k `attr_x<i>` columns (about 1 MB) and 5000 near-empty rows makes every row scan 100k columns twice (about 10^9 string comparisons); one row with 100k filled attribute cells costs about 5x10^9 comparisons in the per-cell "same key ignoring case" loop (quadratic) before `ProductRules` rejects the count (30) at the end. A few such uploads pin a CPU core for tens of seconds. The attribute-count cap is applied only after the work is done. Admin credentials are required, so the impact is limited to a compromised or careless admin, but the dry run is cheap to repeat.
- Fix: in `ReadHeader` refuse more than about `MaxAttributes + tiers + 6` columns (for example `header.Count > 60 + tierCount` -> one line-1 error); precompute the attribute and tier column lists once outside the row loop; stop merging when `attributeCells.Count > ProductRules.MaxAttributes` (report the limit error and skip the merge); use a case-insensitive dictionary instead of the nested scan.

### S-2 (Medium-Low, admin-only) Error-list amplification before the caps are applied (create and PUT)
- Location: `AdminProductsController.CreateProductWithSetup` (the two null-row loops run over the whole list before the 200-row cap, adds one problem per null row; pre-existing from MRV-9.5) and `ProductRules.CheckAttributes` (one problem per bad row; the `> MaxAttributes` check is last; now reachable from PUT as well).
- Risk: Kestrel's default 30 MB body limit allows millions of entries (`[null,null,...]`, or a huge `attributes` object with blank/long keys). The server builds one `ProductProblem` per entry and serialises them all in the 400 body (hundreds of MB of memory/response). PUT is new exposure for the attributes path.
- Fix: check `Prices.Count`, `Stock.Count` and `Attributes.Count` against the caps first and answer a single problem; or cap the problems list (for example first 50); optionally `[RequestSizeLimit(256 KB)]` on create and PUT.

### S-3 (Low) Import error messages echo cell values, unbounded
- Location: `ProductImportPlanner` messages: `sku '{sku}' already appears`, `Category '{categoryName}'`, `price '{priceCell}'`, `{column} '{tierCell}'`, `stock '{stockCell}'`, `Column '{name}'`, `Unknown column '{name}'`, plus the audit `FileName`.
- Risk: the spec and `ProductRules` promise messages that never repeat the value; the import's own messages still do, with no length cut, so a 1 MB cell comes back in the response (bounded by the 2 MB file and one echo per cell, so low). The values are rendered by Angular interpolation, so no XSS; the JSON consumer must not feed them to `innerHTML`. Bidi/zero-width characters in an echoed cell or `FileName` can spoof the display in the screen or the audit view.
- Fix: truncate echoed values to about 40 characters and strip control/Format characters (one helper `Echo(string)`), or drop the value and keep the line/column. The same helper for `FileName` before it goes to the audit details.

### S-4 (Low) No rate limit or size bound on PUT, import and data-check
- Location: `AdminProductsController.UpdateProduct`, `DataCheck`; `AdminProductImportController.Import`.
- Risk: `Import` loads every stored product (with the jsonb attributes) into memory and builds a dictionary on every call, dry runs included; `DataCheck` loads and validates the whole table and returns every broken product in one response (no paging). Cost grows with catalog size and nothing throttles repeated calls. Admin-only, so Low.
- Fix: reuse `ProductSetupPolicy` (or a sibling policy) on import and data-check; in the import select only the SKUs present in the file (it already has the parsed rows) instead of the whole table; consider a cap of, for example, 500 listed products in the data check with the total count.

### S-5 (Low) Validation-to-apply gap in the real import (TOCTOU)
- Location: `AdminProductImportController.Import`: the planner validates against the `stored` snapshot read earlier; the apply step re-reads the products later and writes the planner's merged attribute set and keeps stored description by "blank cell".
- Risk: an edit by another admin between the two reads is silently overwritten for attributes (lost update) or leaves a product whose merge was not re-validated. No privilege issue; small window; no row version on `Product`.
- Fix: acceptable as is for a single-admin shop; if wanted, add a concurrency token (xmin) on `Product` so `TrySaveAsync` returns 409, which the import already handles.

### S-6 (Low) The IsActive-only exception lets a rule-breaking product be reactivated and published
- Location: `UpdateProduct` / `IsOnlyActivationChange`.
- Risk: by design (the Reviewer was invited to challenge it). A product holding data the rules now refuse (an `http` image, control or bidi characters in the name, over-long text, no category) can be set active and appears in the public catalog without being corrected. The public side escapes output, so it is a data-quality issue, not an injection one.
- Fix (optional): allow the exception only for deactivation (`request.IsActive == false`); for reactivation run the full rules. This keeps the stated goal (any product can always be switched off) and removes the publish-broken-data path. The data check already lists what needs correcting.

## Info (no action required)
- I-1 `CheckImageUrl` accepts any https host (including private/loopback names) and Format characters in the URL string; it is only loaded by the visitor's browser (no server fetch), so there is no SSRF. A host allowlist could be considered if images should come from one CDN.
- I-2 Name and attribute text allow lookalike characters (NBSP, combining marks, homoglyphs); the rule targets control and invisible characters only, which matches the stated spec.
- I-3 A CSV-sourced name starting with `=`, `+`, `-` or `@` is stored as is. No export exists today; if a CSV/XLSX export of products, quotes or orders is added later, prefix such cells with `'` there.

## Audit logging
Retained: create (one entry per product, price and stock row), PUT (both branches, entry carries the cleaned stored product) and import (one `Import` entry with file name, counts, warehouse and SKU list). The data check is a read and writes nothing, as intended.
