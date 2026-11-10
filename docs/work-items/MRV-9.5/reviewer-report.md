# Reviewer report MRV-9.5 (issue #56)

Read-only review of the uncommitted change set against `docs/specs/MRV-9.5-admin-product-creation.md`, `orders.md`, `decisions.md`, `worker-report.md`, `pr-notes.md`. No test, build or Docker was run; test counts and audit numbers in the Worker record are unverified by me.

## Verdict: accurate, with 2 mediums, 6 lows and 3 decisions for the owner

No blocker. The change set matches the spec and the Worker record, except the points below (the word "rollback" in AC-8, the legacy-endpoint side effect, and one 500 path I found).

## AC rulings

| AC | Ruling | Evidence |
|---|---|---|
| AC-1 | met | `admin-catalog.html` toolbar: h2 + `new-product` button above the table and above the `<app-product-panel>`; `product-panel.html:1-2` section `aria-labelledby` + `<h3 #heading tabindex="-1">`; `product-panel.ts:107` `afterNextRender` focuses the heading; `admin-catalog.ts` `closePanel()` focuses the button. All fields/tables present (`product-panel.html`, tables in `.table-wrap`). |
| AC-2 | met (wording caveat) | `AdminProductsController.cs:99-170`: Admin-only controller, one `TrySaveAsync(audited)` (l.161) over product + `ProductPricing` + `InventoryRecord` + one audit entry per row. Price/stock rules `ProductSetupRules.cs:176-215`. 400/409 with `{field,message}`. "Any failure rolls back": true because EF's single `SaveChanges` is one DB transaction; see (b). |
| AC-3 | met | `ProductSetupRules.cs` (SKU 3-40 shape, name 2-200, https <=500, description <=2000, attrs <=30, key 1-60, value <=200, no case-duplicate keys, blank rows dropped); category exists `AdminProductsController.cs:170-185`; 409 "SKU já existe." l.126-128 and 164-165; client mirror `product-rules.ts`. |
| AC-4 | met, with caveat (d) | notice names product and SKU (`productSaved`), panel closes or resets, `productRows` puts `newestId` first, storefront proved by `ProductWithSetupTests` and runtime lines 716-717. |
| AC-5 | met | `product-panel.ts` `fill()`, `creating()` hides prices/stock and shows links to /admin/precos and /admin/operacao; PUT carries product data + attributes only. |
| AC-6 | met on the Worker's evidence | not reproducible read-only; `audit.mjs`/`axe.mjs` have `product-new`, `product-errors`, `product-edit` steps. Zero gated overflow claim is consistent with `.table-wrap` use throughout the template. |
| AC-7 | met, with logic flaws (g) | `save()` returns while `request.busy()` (ts:170) and buttons `[disabled]` while busy; runtime burst of 10 -> one 201, rest 409. |
| AC-8 | met except one literal item | "rollback on a bad price after the product row is staged" is NOT literally tested: everything is validated before staging (`Check` runs first), so a bad price never reaches staging; `ABadPrice_OnTheSecondRow...` proves nothing is stored, not a rollback. The Worker disclosed this. Real rollback is only exercised by the Postgres burst test. Suites "three times" and counts: unverified. |
| AC-9 | met | `project.md`, `architecture.md`, `docs/tests/*` modified; free-text input removed (`admin-catalog.html` diff); round trip tests exist (`AttributesRoundTrip_WithoutLoss_ThroughTheEditEndpoint`, client spec). Note the spec says `docs/tests/coverage-map.md`; the repo has `coverage-map-api.md`/`-client.md`, which were updated: fine. |

## (a) Legacy POST/PUT now apply the new rules

Real regression risk, medium. Both `CreateProduct` (l.60-70) and `UpdateProduct` (l.215-226) now run `CheckDescription/CheckImageUrl/CheckAttributes` and answer 400 on any problem. This also applies to PUT of an existing product, and the admin panel's only edit path is that PUT (also the only way to deactivate a product from the UI: `isActive` travels in the same body). So a product whose stored data breaks a new rule can no longer be edited or deactivated until the offending field is fixed in the same request.

What the CSV import (`AdminProductImportController`, `ProductImportPlanner`) can produce versus the new rules:
- Description: no length cap (only the 2 MB file cap) -> can exceed 2,000 characters; a quoted CSV cell may hold newlines (allowed by the description rule) but other control chars fail.
- Attributes: column name limit is 64 (`MaxAttributeNameLength`, planner l.51) versus the new 60; no cap on number of `attr_` columns (new: 30); no cap on value length (new: 200); values with newline/format characters are accepted by import but refused by `HasForbiddenCharacters`; keys are case-sensitive in the import (`merged[name]`), so `attr_Marca` and `attr_marca` (or a re-import with different case) can store case-duplicate keys, which the new rule refuses. Re-import merges into existing attributes, so it can grow past 30.
- Image: import has no image column, so import products have none; only products created through the old API/UI can carry an `http://` or over-long image.
- SKU: import allows 1-64 characters and any characters; the PUT keeps the legacy SKU check (`ValidateAsync`, 64) so SKU is not a problem on PUT; the client lets the original SKU through unchanged (`keptSku`).
- Seed data: `deploy/seed-demo.mjs` and the runtime/unit fixtures use `imageUrl: null`, short attributes (`Marca`, `Cor`); I found no fixture breaking the rules. Existing tests I read (`ProductImportTests` l.109 edits via PUT with `original.Attributes`) pass the new rules. The unknown is the owner's real dev/prod data (images typed as `http://` or plain text in the old input).

Answers: yes, it can block editing an existing product, including import-created ones, in the edge cases above. The Worker disclosed the effect ("must be fixed on next edit") but not the import path or the deactivate consequence. Mitigations, pick one: (1) make the legacy PUT lenient for unchanged values (apply a rule only if the field differs from the stored value); (2) raise the new caps to match import (key 64, and cap the import to the new limits so the two agree); (3) accept and mention in the PR. I recommend (1) or (2); (3) is the minimum and the PR text should state it.

SKU 3-40 (new) versus 64 (legacy): acceptable, because the legacy PUT must keep working for stored SKUs and a stricter new-entry rule is safe. It is an inconsistency, though: the import and the legacy POST still admit 1-2 character and 64-character SKUs, and a SKU created that way can never be re-saved through the with-setup shape. Documented in the panel (maxLength 40 for new, 64 for edit). Accept, note in the PR.

## (b) Atomicity

- Single `SaveChangesAsync` in `AuditLogger.SaveAsync` (AddRange of audit entries + the already tracked product/pricing/inventory); EF wraps it in one DB transaction. One audit entry per row (`AuditedRow`). Correct.
- Constraint failure: unique violation on the product row (lower(sku) index), a missing FK (category/tier/warehouse removed meanwhile), or a duplicate price/stock key all throw `DbUpdateException` -> `IsConstraintViolation()` -> false -> 409. Nothing is stored, since the transaction rolled back as a whole. However the `DbContext` still tracks the failed entities, which is harmless because the request ends; the follow-up `AsNoTracking` query is correct.
- What the 10-simultaneous-submit runtime test proves (api-security.mjs l.729-734): on real Postgres, with the pre-check racing, exactly one request wins and the losers leave no product, price, stock or audit row (counts +4 only, no orphan rows). It proves the DB unique index + single-save rollback under a unique violation on the first inserted row. It does NOT prove rollback of a failure that occurs on a later row (a price or stock constraint) after earlier rows were in the same batch; that case cannot happen through validated input anyway, and EF's batch semantic gives the same guarantee. `AFailingSave_StoresNeitherTheProductNorItsRows` uses an interceptor that throws in `SavingChanges` before any write: it proves the product, rows and audit are in the same single save (a separate audit save would let the product through), not a database rollback. The InMemory provider can't roll back (disclosed).
- Low risk: a non-constraint DB error (e.g. value out of range) propagates as 500 by design; ranges are validated first.

## (c) Validation

- SKU format, trimmed (`ProductSetupRules.cs:75-78`), case-insensitive pre-check (`EqualsIgnoreCase`, l.126) AND a DB-level case-insensitive unique index: `ix_products_sku_lower ON products (lower(sku))` (migration `20261006230437_ProtectHistoryAndUniqueSkus.cs:76`, not in the EF model). So the race is closed at the DB; the InMemory tests only see the pre-check. Good. Stored SKU keeps the typed case.
- Category: `categoryId` null -> 400 "Escolha a categoria"; unknown -> 400 "A categoria escolhida não existe." (l.170-185). Legacy POST still allows null category (spec only requires it for the new flow). OK.
- Image: https only, <=500, no whitespace/control, host required, no credentials. Note: returns the trimmed text, not a normalised URI; `https://a` (single-label host) and IP/private hosts are accepted. Fine for display-only URLs.
- Attributes: matches the spec (<=30 *non-blank* rows, key 1-60, value <=200, case-insensitive duplicates, blank rows dropped). Because the server dedups case-insensitively but the stored dictionary is case-sensitive, a legacy product with `A` and `a` can't be saved (see (a)).
- Price: `> 0`, `<= MaxPrice`, `Round(price,2) == price`, MaxPrice = 9,999,999,999,999,999.99 which is the decimal(18,2) maximum. Stock: int `0..1,000,000`; JSON non-integers fail model binding (400). Duplicate tier/warehouse ids refused. Unknown tier/warehouse ids: 400 naming `prices[i]`/`stock[i]` (`UnknownReferencesAsync`). Rows with null price/qty are skipped, 0 qty kept. All good.
- **Medium: 500 on a null array element.** `request.Prices?.Select(p => new ProductSetupPrice(p.PricingTierId, ...))` and the stock equivalent (`AdminProductsController.cs` ~l.107-109) dereference `p`/`s` without a null check. `{"prices":[null]}` or `"stock":[null]` throws `NullReferenceException` -> 500. Admin-only and not exploitable beyond a 500, but the project rule is "a race is a 409, never a 500" and the runtime suite has a "not-500" matrix. Add a null check (400 `prices[i]`) and a test.
- Low: `Attributes` JSON keys cannot be null; values null are tolerated.

## (d) "Newest first" client-side only

AC-4 says "the new product appears at the top of the table". The list is kept in `newestId` in the component for the session; `GET /api/admin/products` is unordered (`ToListAsync()` with no `OrderBy`), so after a reload the order is the database's. For the stated AC (after saving, see it at the top) it is met; it is acceptable but fragile. Cheap fix if the owner wants a stable order: order by name/SKU on the server or add a created-at; not recommended inside this story.

## (e) Bundle headroom

236,998 B versus gate 237,975 B: 977 B of headroom, about 0.4 %. `ProductPanel` is imported statically by `AdminCatalog`, which is already a lazy route (`admin-portal.routes.ts:14`), so the code is already outside the initial chunk. The gate counts every js/css file (per the Worker's method and `MRV-8.4` records), so lazy-loading the panel further would not lower the measured total. The panel code looks neither trimmed nor padded: the TS, template, `product-rules.ts` and the PT strings are the content. Recommendation: do not spend effort on lazy-loading; if the next MRV-9.x story adds code, either trim (shorten repeated pt-BR hints, remove the 6-item `role=status` hint paragraphs, share more SCSS) or ask the owner to raise the gate deliberately (state the new value in the PR). Put the 977 B headroom in the PR text so the next story knows.

## (f) Image preview versus nginx CSP

Confirmed. `deploy/nginx.conf:11` sends `Content-Security-Policy: ... img-src 'self' data:; ...`. The panel's `<img [src]="https://...">` (`product-panel.html:68`) is therefore blocked in the deployed stack for any external host; `(error)` shows the "imageFailed" fallback. The preview is only useful under `ng serve` or if the CSP changes. Separately: the storefront does NOT render product images at all. `imageUrl` exists in the models (`catalog.model.ts:6`, API DTOs) but there is no `<img>` bound to it anywhere in `client/src/app` outside this panel (`grep` of templates). So the storefront does not "fail" on external images; it never shows images, whether the URL is external or not. Owner decision needed:
1. Leave the CSP and accept a preview that always shows the fallback in production (current state; the saved URL is still stored), or
2. Allow `img-src 'self' data: https:` (weakens the CSP to any https host, a tracking/exfil surface via admin-typed URLs only, low risk), or
3. Allow a named list of hosts once a storage/CDN is chosen (the right long-term answer, tied to the out-of-scope upload story), and remove the preview until then.
Also decide whether showing product images on the storefront is a future story, since this one stores a field nothing displays.

## (g) SPA behaviour

- Focus: heading focused on open (ts:107); Cancel and save close -> button focus (`closePanel`); validation failure focuses the first `aria-invalid` control; attribute add focuses the new key input; remove returns focus to "add". Server-error focus stays on the button (accepted by round 1). Cancel while a request is in flight destroys the panel while the HTTP call completes: the product may be created with no notice (low; `refresh`/notice not shown). Fine.
- Double submit guard: correct (`busy()` check plus disabled buttons; Enter in the form goes through the same `save()`).
- "Este produto já foi criado": only shown if a status-0 failure was seen first and the next 409 carries a `sku` field (`noteFailure`). Flaws, low: (1) `maybeCreated` survives the user changing the SKU, so a 409 for a different, genuinely taken code will wrongly say "já foi criado"; (2) `createdBefore` is cleared only on success, so after the message the SKU hint keeps saying "já foi criado" even when the user edits the SKU, until Cancel; (3) a status-0 does not mean the request never reached the server, which is the case this logic handles, but a 409 after a timeout of a *different* user's identical SKU is indistinguishable; message could say "provavelmente". Fix: reset `maybeCreated`/`createdBefore` when the SKU input changes, and compare the retried payload SKU with the one of the failed attempt.
- Attribute editor round trip: `rowsOf` keeps stored order and values unchanged; `attributesOf` trims keys/values and drops blank rows, so a stored key/value with surrounding whitespace is normalised on edit (not byte-lossless, harmless), and case-duplicate keys or >60 keys/ >200 values block the save with a message (see (a)). Because a key like `marca` and the suggestion `marca` are separate case-sensitively on the server's dictionary, there is no collapse. JSON round trip tests exist.
- No GUID rendered: the panel template shows SKU/name/category name/tier name/warehouse name only; ids appear only in `value` attributes and `id`/`for` of options. The notice uses name and SKU. OK.
- Client MAX_PRICE is a double (`9_999_999_999_999_999.99` is not exactly representable): server is authoritative, handled (accepted by round 1).

## Mismatches and claims not fully supported

1. AC-8 "rollback on a bad price after the product row is staged" is replaced by validate-first; true rollback evidence is only the Postgres burst. Documented by the Worker, but `pr-notes.md` says "nothing half-created" without that nuance.
2. `pr-notes.md` says legacy endpoints "also enforce the image/attribute/description rules" but does not say this can block editing/deactivating import-created products (see (a)).
3. Worker record: "legacy PUT/POST keep ... no SKU/name format rule" - consistent with code, and the SKU 3-40 vs 64 split is stated only implicitly.
4. Worker/layout/test numbers (752 / 1470 / 429, 368 loads, 66 pairs, 236,998 B) are not independently verified here.
5. The spec said the success message "naming it": met (name and SKU).

## Missing tests

- `{"prices":[null]}` / `{"stock":[null]}` (500 path).
- Legacy PUT of an existing product whose stored description/attributes break the new rules (documents the behaviour: either blocks or is lenient).
- Import-created product with a 61-64 character attribute name, 31+ attributes, or case-duplicate keys followed by PUT.
- Client: SKU edited after a status-0 failure (the "já foi criado" message should not persist).
- Cancel while busy.

## Decisions for the owner

1. Legacy PUT strictness (a): lenient for unchanged values, align import limits, or accept.
2. CSP / image display (f): `img-src` change, host list later, or no preview; and whether the storefront will ever show images.
3. Bundle gate (e): headroom 977 B; confirm whether the next story may raise the gate.
