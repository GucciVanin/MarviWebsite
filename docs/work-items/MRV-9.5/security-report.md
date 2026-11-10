# MRV-9.5 security report

Verdict: **pass** (no high/critical; 3 low, 3 info). Static review of the uncommitted change set; nothing run.

## Checked and fine
- Authorization: controller is `[Authorize(Roles = "Admin")]`; new action inherits it. Matrix test and runtime matrix include `POST /with-setup` as AdminOnly.
- Mass assignment: request record has no Id/IsActive-overrides; ids generated server side; `MinQty` fixed 1; `QtyReserved` default 0; `IsActive` omitted = false (safe default). Unknown JSON fields ignored.
- Tier/warehouse/category existence checked before staging (400 naming `prices[i]`/`stock[i]`/`categoryId`); duplicates per tier/warehouse refused; tiers and warehouses are global, none belongs to another tenant.
- Atomicity: all rows and one audit entry per row in a single `SaveChanges` (`TrySaveAsync(IReadOnlyCollection<AuditedRow>)`); unique-SKU race (case-insensitive unique index from migration) is caught -> 409, runtime burst test covers it. Audit content: product fields, ids, price, qty; no PII.
- Validation: SKU ASCII regex after trim (no look-alikes, no trailing-newline `$` trap since trimmed); name/key/value reject control + format + line/paragraph separators; image URL https only, no whitespace/control, no userinfo, host required, 500 max (blocks javascript:, data:, protocol-relative, http). Price > 0, <= decimal(18,2) max, 2 decimals; qty 0..1,000,000 int; JSON cannot carry NaN. Error messages are fixed text and never echo values.
- Attributes: `Dictionary<string,string>` -> jsonb, size-capped (30 rows, 60/200 chars), case-insensitive duplicates refused. `__proto__` key is inert server side; the SPA reads it into rows (array), not an object keyed by it.
- Rate limit: policy `productSetup`, partition = client IP like the others, defaults 30/60 s; 100000 overrides only in `MarviApiFactory` and `deploy/docker-compose.yml` (dev), none in production config; 429 + Retry-After tested.
- Legacy POST/PUT: now apply the same description/image/attributes checks, so it closes a gap (any scheme/size previously accepted) and opens nothing; errors are fixed messages. Legacy SKU/name rules unchanged.
- XSS: no `innerHTML`/`bypassSecurity*` in the change; all text uses Angular interpolation. The only place `imageUrl` is rendered is the panel preview `<img [src]>` (admin's own input, https-validated, `referrerpolicy="no-referrer"`). No storefront/template renders `imageUrl` or attributes yet. No links built from product data.
- SPA: ids stay out of the UI (labels use names/SKU); server errors shown via field messages/`app-error-alert`.
- Migrations: none added (last one is MRV-9.6's, already committed). `git status` shows no migration files.
- `docs/operations.md`: accurate (policy name, 30/60 s, env var `RateLimiting__ProductSetup__PermitLimit`). The "Tune with" list omits `__WindowSeconds` for it only by the "each also" wording; fine.

## Findings
1. **Low** - `AdminProductsController.CreateProductWithSetup`/`UnknownReferencesAsync`: no cap on the number of `prices`/`stock` rows. An admin (or stolen admin token) can post tens of thousands of rows; `Contains(ids)` can exceed Postgres' parameter limit and produce a 500, and the loops are O(n). Fix: reject more than e.g. 200 rows each in `ProductSetupRules` (`prices`/`stock` field message) and/or rely on a smaller request body limit for this action.
2. **Low** - `ProductSetupRules.CheckDescription`: description may contain bidi/zero-width format characters (only controls are refused, unlike name/attributes). Harmless today (nothing renders it unescaped) but a spoofing vector once the storefront shows it. Fix: apply `HasForbiddenCharacters` with newline/tab allowance, as the SPA's `hasInvisible(text, true)` already does (client and server disagree: the client rejects them, the server accepts).
3. **Low** - Legacy `PUT` audits the raw `request` (untrimmed, unvalidated shape) while the row stores the cleaned values; audit may differ from stored data. Pre-existing pattern; optional fix: audit the cleaned values.
4. **Info** - Production CSP `img-src 'self' data:` blocks the https preview in `product-panel.html`, so the admin sees "imagem não carregou" for every external URL; this also neutralises tracking-pixel/mixed-content concerns. When a storefront starts rendering `imageUrl`, an image host allow-list/CSP decision and `referrerpolicy` must be made then.
5. **Info** - Image URL stored as typed text (not the normalised `Uri`), so forms like `https:/host` pass; browsers normalise them equally. No server-side fetch exists, so no SSRF today; if one is ever added (thumbnailing/proxy), it needs host/IP restrictions.
6. **Info** - Rate-limit order: anonymous or 403 requests also consume the per-IP bucket (same as every existing policy); with a shared NAT address an unauthenticated caller could exhaust an admin's 30/min. Existing design, not a regression.
