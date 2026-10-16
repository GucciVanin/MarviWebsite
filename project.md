# Marvi — Project Specification & Roadmap

High-level technical spec, organised with SCRUM. Companion documents: [goal.md](goal.md) (why — wins
any conflict), [architecture.md](architecture.md) (how it is built).
Last reviewed: 2026-10-09. Status values: **Done**, **Partial**, **Not started**.

## 1. Product vision

One web platform for a wholesale distributor: public catalog and coverage check, self-service client
accounts with quotes and orders, an employee portal for order-taking, and an admin portal for
people, catalog, pricing, warehouses and audit. See [goal.md](goal.md).

## 2. SCRUM set-up

| Item | Definition |
|---|---|
| Product Owner | The business owner (final say on goal.md and backlog order) |
| Scrum team | Developers and AI agents working from this repo |
| Sprint length | 2 weeks (proposed) |
| Ceremonies | Planning, daily sync, review against goal.md, retrospective |
| Backlog | Section 6. Items use `MRV-<n>.<m>` IDs. Priority = top-to-bottom within a release |
| Definition of Ready | Story has acceptance criteria, a target feature folder, and no open question in section 8 that blocks it |
| Definition of Done | Builds with 0 errors; tests added and `dotnet test Marvi.slnx` green; client builds; architecture.md and this file updated if behavior, structure or status changed; server-side authorization verified |

## 3. System summary

- **SPA** (Angular) → **REST/JSON API** (ASP.NET Core, .NET 10) → **PostgreSQL 16**.
- Roles: `Client`, `Employee`, `Admin`, enforced server-side with JWT bearer tokens.
- One external integration: geocoding (Azure Maps or Google Maps) behind `IGeocodingProvider`.
- Docker Compose runs Postgres, API and an nginx-served SPA.
- Business capabilities are organised as **features** (Identity, Catalog, Coverage, Quotes, Orders,
  Inventory, Auditing) mirrored across API, domain and tests; the SPA mirrors them as portals.

## 4. Functional requirements and current status

| # | Requirement | Status | Notes |
|---|---|---|---|
| F1 | Client self-registration and login (JWT) | Done | Registration approves the client immediately and assigns the default pricing tier; admins can suspend |
| F2 | Roles Client / Employee / Admin, server-side enforcement | Done | `[Authorize(Roles=…)]` per controller; Angular guards are UX only |
| F3 | Public product list/detail with tier pricing and active deals | Done | Anonymous users get the default tier (`PricingTier.IsDefault`) |
| F4 | Product attributes as free-form spec sheet | Done | `Product.Attributes`, stored as jsonb |
| F5 | Admin CRUD: products, deals, warehouses, coverage areas, pricing tiers, per-tier product prices | Done | Categories added in MRV-1.6 (CRUD under `/api/admin/categories`) |
| F6 | Coverage check by address (single warehouse, radius) | Done | Polygon areas throw `NotSupportedException` until Release 2 |
| F7 | Quotes: client creates, system auto-prices, employee sets final price, client accepts | Partial | Create / queue / price / accept done. Client reject done (MRV-1.4) |
| F8 | Accepted quote becomes an order | Done | Single operation, `QuoteWorkflowService.AcceptQuote` |
| F9 | Employee places orders directly | Done | Requires client `Approved`; server-side pricing; refuses products with no price for the client's tier |
| F10 | Employee history of quotes, orders, inventory changes | Not started | Only the quote queue and per-client profile exist (MRV-1.2) |
| F11 | Inventory per warehouse (on hand / reserved / reorder point), employee-only | Partial | Employee read endpoint; admin upsert of stock. Orders do not reserve or decrement stock; no history |
| F12 | Admin: suspend client, adjust credit/pricing | Partial | Approve and suspend exist (suspended clients cannot quote or accept); update-credit done (MRV-1.3); the credit limit is stored but not yet enforced anywhere |
| F13 | Admin audit log of mutations | Partial | Written by admin controllers via `AuditLogger`; read endpoint exists; no UI filtering/paging |
| F14 | CSV product import (MVP requirement) | API done (MRV-2.1) | `POST /api/admin/products/import`; no upload screen yet (MRV-2.4b) |
| F15 | Home page with the owner's design | Built (2026-10-14) | Spec in section 10 (MRV-2.3a–e); landing page, public stats, catalog and hero island done; open: self-hosted fonts, scroll reveals, real photos, Lighthouse measurement |
| F16 | Client profile management (addresses, company) | Done (MRV-2.2) | `GET/PUT /api/client/profile` and a "Meus dados" card in the customer portal; the shipping addresses are not yet used when an order is placed |

## 5. Non-functional requirements

| Area | Requirement | Status |
|---|---|---|
| Security | Prices computed server-side only; API keys server-side only; JWT secret outside source in production | Partial — placeholder key in `appsettings.json` and a dev admin seed in `appsettings.Development.json`/compose; no rate limiting; no key rotation |
| Security | Ownership checks (a client sees only their own quotes/orders) | Done |
| Performance | Coverage check under 300 ms average; lazy-loaded SPA features | Not measured / Done |
| Reliability | EF migrations on startup; Dockerised deployment | Done — compose stack built and verified (migrations, admin seed, SPA, login via the nginx `/api` proxy) |
| Maintainability | Feature-modular code; one record per DTO file; documented architecture | Done (Sprint 1) |
| Quality | Automated tests for rules and API | Partial — 18 backend tests (incl. the register → quote → price → accept flow); one frontend spec |

## 6. Roadmap and product backlog

### Release 1 — MVP

**Sprint 1 — Foundation and re-organisation (Done, 2026-10-01)**
- Renamed the product to Marvi (solution, projects, namespaces, database, containers, SPA).
- Reorganised the backend by feature (`Features/<X>` in the API, `<X>` in the domain, mirrored in
  tests) with a self-registering `*Module` per feature; `AuditLogger` and JWT issuing are injected
  services; `Program.cs` is composition only.
- Reorganised the SPA into `core/`, `shared/`, `features/<x>/` with one lazy route file per feature.
- Removed the stale Angular placeholder template from `app.html`.
- Rewrote goal.md, project.md, architecture.md; archived the old plan documents in `docs/archive/`.

**Sprint 1b — MVP stabilisation (Done, 2026-10-01)** — fixes to code that existed but did not work end to end:
- New clients could never get a quote: registration left them `Pending` with no pricing tier. Registration now approves immediately (per spec) and assigns the default tier.
- Added `PricingTier.IsDefault` (one enforced by a unique filtered index) replacing the alphabetical-first fallback; the "Standard" default tier is created on first run.
- There was no way to create the first Admin, pricing tiers, product prices or stock. Added a configured admin seed (`Seed:AdminEmail`/`Seed:AdminPassword`) and admin endpoints for pricing tiers, per-tier product pricing and inventory upsert.
- The unique index on product prices ignored `MinQty`, making quantity breaks impossible; it now includes it (migration `MvpFixes`).
- Admins got 403 when pricing quotes or placing orders (no employee id claim); they can now do both, recording no employee.
- Employee orders silently priced unpriced products at $0; they now return 400. Quotes/orders validate non-empty lines and quantity >= 1; pricing a quote requires every line priced with a non-negative price; suspended clients cannot quote or accept.
- Frontend: added the missing registration page and role-based redirect after login.
- Docker: client image used Node 20 (Angular CLI needs 22.22.3+); compose now passes the admin seed and JWT key.

**Sprint 2b — Architecture fixes (Done, 2026-10-14; all ten stories merged, only the Release 2 stock-reservation row remains)** — from the architecture review of 2026-10-06. Each story is one commit and one GitHub issue (the issue holds the full spec); stories are delivered one PR per feature: **Quotes and orders** (4.2, 4.3), **Admin mutations** (4.4, 4.5, 4.6), **Identity claims** (4.7), **Coverage** (4.8, 4.9), **Inventory** (4.10), **Front end** (4.1, delivered in PR 14). Rules for all of them: no behaviour change except where stated; characterization tests first; existing API tests stay green; runtime checks added to `test/runtime/` for every endpoint touched (success, 400, 403, 404, 409, never 500). Vocabulary in `CONTEXT.md`; naming decision in `docs/adr/0001-customer-in-prose-client-in-code.md`.

| ID | Story | Issue | Approved behaviour change |
|---|---|---|---|
| MRV-4.1 | ~~Front-end loading and error handling with pt-BR messages by HTTP status; applied to every existing screen~~ **Done (2026-10-09, PR pending review)** — `loadable`/`action`/`describeApiError` in `core/http`, `app-load-state`/`app-error-alert` in `shared/ui`; storefront, Customer, employee and admin portals, login and register use them; hard-coded English moved to pt-BR; 59 client tests (was 35) | [#2](https://github.com/GucciVanin/MarviWebsite/issues/2) | None (API unchanged) |
| MRV-4.2 | ~~Customer eligibility as one Domain rule~~ **Done (2026-10-12, in the Quotes and orders PR)** — `CustomerEligibility.IsEligible`, used by quote create, quote accept and employee orders; 113 API tests (was 104) and 163 runtime checks pass | [#3](https://github.com/GucciVanin/MarviWebsite/issues/3) | Pending customers are refused (403) when requesting or accepting a quote |
| MRV-4.3 | ~~Basket pricing in one Domain module (Deal window once, missing price as a result, shared order building)~~ **Done (2026-10-12, in the Quotes and orders PR)** — `BasketPricingService`, `Deal.ActiveAt`, `OrderFactory`, `PricingDataLoader`; 123 API tests and 167 runtime checks pass | [#4](https://github.com/GucciVanin/MarviWebsite/issues/4) | Accepting a quote with an unpriced line returns 409 instead of creating a zero-price order |
| MRV-4.4 | ~~Admin mutations save and audit in one transaction~~ **Done (2026-10-13, in the Admin mutations PR)** — `AuditLogger.TrySaveAsync` + `AuditActions`; `LogAsync` removed; 131 API tests and 177 runtime checks pass | [#5](https://github.com/GucciVanin/MarviWebsite/issues/5) | None on success |
| MRV-4.5 | ~~Constraint races map to 409 on all admin controllers~~ **Done (2026-10-13, in the Admin mutations PR)** — every admin controller commits through `TrySaveAsync` and answers 409; race checks (parallel requests on real Postgres) added to the runtime suite; 188 runtime checks pass | [#6](https://github.com/GucciVanin/MarviWebsite/issues/6) | Races that returned 500 now return 409 |
| MRV-4.6 | ~~Shared admin input policy and delete guards~~ **Done (2026-10-13, in the Admin mutations PR)** — `AdminInput`, `DeleteGuard`; existing limits and messages preserved exactly (11 pinning tests); no new limits (owner decision); 142 API tests and 199 runtime checks pass; one `InputProblem` shape for every admin validator | [#7](https://github.com/GucciVanin/MarviWebsite/issues/7) | None (new limits on deals, tiers and warehouses need owner approval) |
| MRV-4.7 | ~~Identity claims issued and read in one module~~ **Done (2026-10-14, in the Identity claims PR)** — `Principal` (issue and read claims, `CanActAsStaff`); token contents unchanged and pinned per role; 11 new tests (150 API tests) and 206 runtime checks pass | [#8](https://github.com/GucciVanin/MarviWebsite/issues/8) | None |
| MRV-4.8 | ~~Geocoding outcomes distinguish unavailable from not found (internal; visitor response unchanged)~~ **Done (2026-10-14, in the Coverage PR)** — `GeocodeOutcome`, `HttpGeocodingProvider` base, adapter tests with stubbed HTTP; 181 API tests pass (216 runtime checks at the end of the feature) | [#9](https://github.com/GucciVanin/MarviWebsite/issues/9) | None |
| MRV-4.9 | ~~Default pricing tier and coverage-area selection move into Domain~~ **Done (2026-10-14, in the Coverage PR)** — `DefaultPricingTier.ShouldBeDefaultAsync/MakeDefaultAsync`, `CoverageService.CheckCoverage(lat, lng, warehouses)`; 188 API tests and 216 runtime checks pass | [#10](https://github.com/GucciVanin/MarviWebsite/issues/10) | None |
| MRV-4.10 | ~~Stock availability in Domain; public product list stops loading all stock~~ **Done (2026-10-14, in the Inventory PR)** — `StockAvailability` (Domain/Inventory); the product list reads only the stock of the products it returns; 201 API tests and 220 runtime checks pass | [#11](https://github.com/GucciVanin/MarviWebsite/issues/11) | None |

Order of work: 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 4.9 → 4.10. Open owner decisions raised by these specs: new length limits for deals, tiers and warehouses (4.6); showing visitors a distinct "unavailable" message for coverage (4.8); optional stable API error codes (follow-up to 4.1).

**Sprint 2 — Front end, so the product can be used and tested (In progress, started 2026-10-02)**

Why first: the API is ahead of the UI, and the owner cannot exercise the product without screens. Order of work: 2.3a → Sprint 2b (done) → 2.4a.1 → 2.4a.2 → 2.4a.3 → 2.4a.4 → 2.4a.5 → 2.3e → 2.3b → 2.3c → 2.3d.

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-2.3a | ~~Design system foundation and app shell~~ **Done (2026-10-02)** | Tokens, global styles, shared header (role-aware nav, login/logout) and footer, UI primitives (button, card, field, alert, page container) per section 10; pt-BR strings in one translations file; login and register restyled with them. Every existing route reachable from the header. **Delivered:** SCSS tokens/base/primitives in `client/src/styles`, `core/i18n/pt-br.ts`, `shared/ui` header and footer, app shell with skip link, interim Home, restyled login/register, `AuthService.homeUrl`; **Also fixed, found by runtime tests:** role claim name, enum-as-string API contract, zoneless rendering in storefront and portals (see §9). 17 client tests. Header shows only Início and Produtos for now; MRV-2.3c adds Nossa Rede, Sobre and Por que a Marvi when their sections exist; portals are reachable through the role button (Minha área / Painel / Administração) |
| MRV-2.4a | ~~Usable screens for the core flow~~ **Done (2026-10-14)** — sliced into the five stories below, all delivered in one PR | Original scope: Admin manages categories, products (with category), pricing tiers, per-tier prices, warehouses/coverage, stock; Client browses, requests a quote, sees quotes, accepts, sees orders; Employee works the quote queue and prices, places an order. Every action surfaces API errors in plain pt-BR (the loading/error pieces from MRV-4.1 are reused). **Why sliced:** one PR would touch all three portals plus six new front-end services and could not be verified end to end in one review. **Verification for every slice:** component specs with `HttpTestingController` (what the user sees on loading, success, empty, each failure status), plus the flow driven in the built-in browser against the dev stack (`http://localhost:4200`, seeded admin) with the result described in the PR. No backend change is expected; if a slice finds one it is called out, not hidden. Delivered one PR per portal: Client portal (.1), Employee portal (.2), Admin portal (.3 to .5) |
| MRV-2.4a.1 | ~~Client quote flow~~ **Done (2026-10-14, in the Portals PR)** — catalog picker with search and category filter, quote basket, quote cards with lines and prices, accept, order cards; driven end to end in the built-in browser (quote 6 x R$ 8,00 + R$ 1,60 -> order R$ 49,60) | A customer can: pick products from the catalog (search and category filter, not a typed product ID) into a quote request with quantities, send it, see their quotes with product names, quantities, suggested and final unit prices and status, accept a Priced quote, and see the resulting orders with their lines and total. Empty and error states per MRV-4.1. Not in scope: rejecting a quote (MRV-1.4), profile and addresses (MRV-2.2) |
| MRV-2.4a.2 | ~~Employee quote pricing and order taking~~ **Done (2026-10-14, in the Portals PR)** — queue with editable final prices (suggestions prefilled, validated, errors inside the quote), customer lookup **by ID** (the API has no way to search customers by company name, so lookup by company needs a new endpoint: raised under MRV-2.4b), order form for Approved customers using the shared product picker; driven end to end in the built-in browser (order 2 x R$ 8,50 + R$ 2,10 = R$ 19,10; an unpriced product refused with the reason shown). Original criteria: | An employee (or admin) can: see the Submitted queue with customer, lines and the system's suggested prices; set a final unit price per line and send it (every line priced, non-negative, validation messages in pt-BR); look up a customer by ID or company; place an order for an Approved customer (delivery address, product lines with quantities, server-side prices shown after saving; ineligible or unpriced products refused with the API's reason shown in pt-BR). Not in scope: history views (MRV-2.4b/MRV-1.2) |
| MRV-2.4a.3 | ~~Admin catalog screens~~ **Done (2026-10-14, in the Portals PR)** — admin shell with sub-page navigation (`/admin`, `/admin/catalogo`), categories and products create/edit/delete with a two-step delete, attributes as `name: value` lines, every API refusal shown in pt-BR with the server reason; driven in the built-in browser (category + product created, delete of a category in use refused). Original criteria: | An admin can create, edit and delete categories (name, order, active; delete refused with the reason when in use) and products (SKU, name, description, category, active, free-form attributes; duplicate SKU, limits and delete protection shown in pt-BR). Needs new front-end services for categories (and the category list for the product form) |
| MRV-2.4a.4 | ~~Admin pricing screens~~ **Done (2026-10-14, in the Portals PR)** — `/admin/precos`: tiers (create, rename, make default in one click; the only default cannot be unset) and per-product prices per tier and minimum quantity (add, edit, confirm-then-remove), refusals shown in pt-BR with the reason; driven in the built-in browser (a tier created, base and quantity-break prices saved and confirmed through a real quote: 2,50 for 1 unit, 2,20 for 12; default switched and restored). Original criteria: | An admin can manage pricing tiers (create, rename, make default; the only default cannot be unset) and, per product, the tier prices with quantity breaks (add, change, remove). Needs front-end services for pricing tiers and product pricing. Deals management is not in this slice (not in the original scope) |
| MRV-2.4a.5 | ~~Admin warehouse, coverage and stock screens~~ **Done (2026-10-14, in the Portals PR)** — `/admin/operacao`: warehouses (name, address, coordinates validated), radius and polygon coverage areas (polygon stored and marked "ainda não usada" in the delivery check), stock per product and warehouse (create and adjust); deletes need a confirming click and refusals show the API reason in pt-BR; driven in the built-in browser (warehouse, 40-mile area and 30 units of stock created; deleting the warehouse with stock refused). Original criteria: | An admin can manage warehouses (name, address, coordinates) and their coverage areas (radius; polygon stored but marked "not supported yet"), and set stock per product and warehouse (on hand, reorder point). Delete refusals and conflicts shown in pt-BR. Needs a front-end service for the stock upsert |
| MRV-2.3e | ~~Public catalog browse~~ **Done (2026-10-14, in the Public site PR)** — `/storefront` as a card grid with list prices ("Sob consulta" when unpriced), deal and stock badges, search and category filter recorded in the URL so a link can point at a filtered catalog, register / customer-area call to action, delivery check and running deals; driven in the built-in browser as an anonymous visitor. Original criteria: | "Explore our supply" opens a catalog anyone can browse (search, filter by category from `GET /api/categories`); anonymous visitors see list prices as the API returns them; links to register for quotes |
| MRV-2.3b | ~~Public landing-page data~~ **Done (2026-10-14, in the Public site PR)** — `GET /api/public/stats` (`PublicStatsController`): active products, active categories and radius coverage areas (polygon areas are stored but not served yet, so not counted); `GET /api/categories` and the stats carry `Cache-Control: public,max-age=60`; 206 API tests and 227 runtime checks pass. Original criteria: | `GET /api/categories` (public, active only) and `GET /api/public/stats` (product count, category count, active coverage areas); anonymous, no prices; categories half is done (MRV-1.6) |
| MRV-2.3c | ~~Landing page (Home)~~ **Done (2026-10-14, in the Public site PR)** — all sections of 10.3 built from the mockup (hero with static ribbons and an image placeholder, flow, live stats band with count-up, six category tiles from the API linking to the filtered catalog, closing banner), header and footer links to the sections, pt-BR copy; verified in the browser at 1280 px and 390 px (no horizontal overflow, menu collapses), anchor navigation from another page, and with the API stopped (all five sections render with static copy, no error banners). Not measured: Lighthouse scores and real photos (owner supplies them, Q5/Q6). Original criteria: | All sections of section 10.3 built from the mockup, wired to MRV-2.3b, responsive and accessible per 10.5 |
| MRV-2.3d | ~~Hero ribbon animation (React island)~~ **Done (2026-10-14, in the Public site PR)** — `client/island` builds one script, `<marvi-ribbons>` (React 18.3.1, 45.8 KB gzipped; React 19 was 68.5 KB, over the budget), loaded after first paint when the browser is idle; the static SVG is the element's own content, so no-JS, reduced motion and a failed load all keep it; the animation pauses off-screen and in hidden tabs; the build fails over 60 KB gzipped. Driven in the built-in browser: element defined, paths change over time. Original criteria: | Stretch, last in the sprint. Isolated React bundle renders the animated ribbons; lazy-loaded; static fallback for reduced-motion, no-JS and load failure; budget in 10.4 |

**Sprint 3 — Close the MVP spec gaps and data in (Not started)**

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-1.1 | ~~As a client I get immediate access after registering~~ **Done in Sprint 1b** | Implemented per spec (Q2 resolved). Remaining: tests for `Pending` behavior if admin approval is ever re-introduced |
| MRV-1.2a | ~~Quotes history~~ **Done (2026-10-15, in the Employee history PR)** — `GET /api/employee/quotes/history`: every quote in any status, newest first, filter by customer, status and request date (`from` inclusive, `to` exclusive, UTC), paged with `TotalCount`; shared `Paging`/`PagedResult`/`DateRange` in `Api/Features/Common` (the audit log shares the paging cap but still returns a bare list). API only: the screen is part of MRV-2.4b. Original criteria (whole story 1.2): | `GET /api/employee/quotes/history`, `/orders/history`, `/inventory/history` (paged, filterable by client/date); inventory changes are recorded when orders consume stock |
| MRV-1.2b | ~~Orders history~~ **Done (2026-10-15, in the Employee history PR)** — `GET /api/employee/orders/history` with the same filters and paging as 1.2a; orders had no timestamp, so `Order.PlacedAt` (migration `AddOrderPlacedAt`, backfilled from the quote's request date, else the migration time; existing orders therefore carry an approximate time: a direct employee order that predates the migration sorts as newer than every older quote order and falls outside its real date range; new orders are exact) is set by `OrderFactory` and shown on the customer's order cards ("Realizado em"); the four copies of the order-to-DTO mapping became `OrderDto.From`. Original criteria: | `GET /api/employee/orders/history`, same filters and paging as 1.2a. Orders have no timestamp today, so this adds `Order.PlacedAt` with a migration that backfills existing orders (from the quote's request date when there is one) and shows it on the order |
| MRV-1.2c | Inventory history | **Blocked, sliced out of 1.2 (2026-10-15):** there is no stock-movement record and orders do not reserve or decrement stock (Release 2), so there is nothing to list. Needs a movement ledger (written by admin stock changes and, later, by orders) before `GET /api/employee/inventory/history` is meaningful; to be specced with the Release 2 stock-reservation row |
| MRV-1.3 | ~~As an admin I adjust a client's credit and pricing tier~~ **Done (2026-10-15, in the Customer credit PR)** — `PUT /api/admin/clients/{id}/update-credit` (`UpdateClientCreditRequest`: tier and credit limit; 400 for a negative limit or unknown tier, 404 unknown customer; status untouched, so it also works for a suspended customer; audited as `Update` with the previous values); the next quote is priced from the new tier. The credit limit is only data today: no rule uses it yet. API only: the admin screen is part of MRV-2.4b. Original criteria: | `PUT /api/admin/clients/{id}/update-credit`; audited |
| MRV-1.4 | ~~As a client I can reject a priced quote~~ **Done (2026-10-15, in the Quote rejection PR)** — `QuoteWorkflowService.RejectQuote` and `POST /api/quotes/{id}/reject` (owner only; 400 unless Priced; 403 for another customer; 404 unknown; allowed for a suspended account because it creates nothing); the customer portal offers "Recusar cotação" with a confirming click and shows the quote as Recusada. Original criteria: | `POST /api/quotes/{id}/reject`; only Priced quotes; only the owner |
| MRV-1.5 | ~~Anonymous pricing uses a deliberate list-price tier~~ **Done in Sprint 1b** | `PricingTier.IsDefault` + migration; one default enforced |
| MRV-1.6 | ~~As an admin I manage categories~~ **Done** | `Category` entity (name unique ignoring case, `SortOrder`, `IsActive`); audited CRUD under `/api/admin/categories`; public `GET /api/categories` (active only, with active-product counts); `Product.CategoryId` is a real foreign key and product writes reject unknown categories; delete is blocked with 409 while a product or deal uses the category. Migration `AddCategories` keeps pre-existing orphan `category_id` values by creating an inactive `Legacy <id>` category for each, which an admin can rename and activate. Deals also reject unknown category ids. Concurrent duplicate/delete races return 409 (only for real unique/FK violations; case-insensitive unique index `ix_categories_name_lower`; verified with 12 parallel creates: one 201, eleven 409). Verified on real PostgreSQL |
| MRV-2.1 | ~~As an admin I import products from CSV~~ **Done (2026-10-15, in the Product import PR)** — `POST /api/admin/products/import` (multipart `file`; `dryRun`; `warehouseId`): `ProductCsv` reads the file (comma or semicolon, quotes, BOM), `ProductImportPlanner` (Domain) checks it, the controller stores it in one save with one `Import` audit entry. Rules: schema Q1 (`sku`, `name` required; `description`, `category`, `price`, `stock`, `attr_<name>`, `tier_<name>`); **all or nothing**: any error imports nothing and every problem is reported with its line; a column outside the schema is an error (catches typos); category and tier names must already exist (an import never creates them) and must match exactly one (tier names are not unique, so an ambiguous one is refused, not guessed); `price` is the default tier's price for quantity 1 and `tier_<name>` that tier's; `stock` needs a warehouse (`warehouseId`, or implied when there is exactly one); rows match by SKU ignoring case; **a blank cell leaves an existing value unchanged** (so a re-import cannot wipe data, but cannot clear it either), attributes merge, an existing product keeps its active flag; at most 5000 rows and 2 MB; prices accept 12.5, 12,50, 1.234,50 and R$ 12,50 but **at most 2 decimals, so an ambiguous `1.234` is refused** (write `1.234,00` or `1234`; it would otherwise be stored as R$ 1,234); Excel's trailing empty columns are ignored; the audit entry lists the SKUs. API only: the upload screen is part of MRV-2.4b. Original criteria: | Schema agreed (Q1); per-row validation report; idempotent by SKU; audited; lives in the Catalog feature |
| MRV-2.2 | ~~Client profile management~~ **Done (2026-10-15, in the Customer profile PR)** — `GET/PUT /api/client/profile` (`ClientProfileController`: always the caller's own account; company name, billing address, a shipping list replaced as a whole; trimmed, blank and repeated lines dropped, at most 10 addresses of 500 characters; allowed for a suspended customer; not audited because it is not an admin mutation); the rules are shared with registration (`ClientProfileRules`); the customer portal has a "Meus dados" card (one shipping address per line). Credit and tier are not shown to the customer. **Not done:** orders do not yet take their delivery address from these addresses (an order made from a quote still shows "Endereço a confirmar"). Original criteria: | `/api/client/profile` GET/PUT incl. shipping addresses; UI in the client portal |
| MRV-2.4b.1 | ~~Customer directory~~ **Done (2026-10-16, in the Portal parity PR)** — `GET /api/employee/clients?search=&page=&pageSize=` (employee and admin): customers whose company name contains the text (ignoring case; `%` and `_` are plain text), A to Z (customers have no creation date), paged with the total, each line with status, tier and credit; the employee portal now searches by company name and shows up to 10 matches to pick from ("Mostrando 10 de 37. Refine a busca...") instead of asking for a typed ID; the queue's "Consultar cliente" still opens a customer directly. Original criteria: | Backend: `GET /api/employee/clients?search=&page=&pageSize=` finds customers by company name (case-insensitive contains), paged, with status, tier and credit; employee and admin. UI: the employee portal looks a customer up by company name instead of a typed ID. Found by the 2.4a review (the lookup was by ID only) |
| MRV-2.4b.2 | ~~Employee history screens~~ **Done (2026-10-16, in the Portal parity PR)** — `/employee/historico`: a Cotações / Pedidos switch, filters (customer picked through the directory search, status, from and to dates; the last day is included), paging ("Página 2 de 3"), loading, empty ("Nada encontrado...") and error-with-retry states; linked from the employee portal. The history API items now carry `companyName` (`QuoteHistoryItemDto`, `OrderHistoryItemDto`) so a screen can say who each is for. Original criteria: | Employee portal pages for the quotes and orders history (MRV-1.2a/1.2b): filter by customer (from the directory), status and date range, paged; error and empty states per MRV-4.1 |
| MRV-2.4b.3 | ~~Warehouse names in the employee stock table~~ **Done (2026-10-16, in the Portal parity PR)** — `InventoryRecordDto` carries `WarehouseName` (employee stock list and the admin stock change response); the employee stock table shows the name instead of the id. Original criteria: | Backend: the employee inventory response carries the warehouse name; UI shows it instead of the warehouse ID (found by the 2.4a review) |
| MRV-2.4b.4 | ~~Admin customers screen~~ **Done (2026-10-16, in the Portal parity PR)** — `/admin/clientes` (new "Clientes" tab): search by company name (first 20, "Mostrando 20 de 57. Refine a busca..."), each customer with status, tier and credit; **Editar** changes the pricing tier and credit limit (MRV-1.3; refuses an empty or negative limit before sending), **Suspender** needs a confirming click, **Aprovar** reactivates a suspended customer keeping their tier and limit; every refusal in pt-BR with the server reason. The directory line now carries `pricingTierId` (tier names are not unique). Original criteria: | Admin screen listing customers (from the directory) with approve, suspend and update credit and pricing tier (MRV-1.3); refusals in pt-BR |
| MRV-2.4b.5 | Admin product import screen | Admin screen to upload the CSV (MRV-2.1), run a dry run, choose a warehouse, import, and see every error with its line |
| MRV-2.4b.6 | Admin audit log screen | The audit log as its own admin page with paging (the admin home only shows the latest entries) |
| MRV-2.4b.7 | Shared helper for the admin screens | Behaviour-preserving refactor: the create / edit / two-step-confirm-delete pattern repeated across the catalog, pricing and operations screens becomes one shared helper in `shared/` (found by the 2.4a review); the existing specs must keep passing unchanged |

**Sprint 4 — Make it shippable (Not started)**

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-3.1 | Verify Docker Compose end to end | `docker compose up --build` yields a working SPA → API → DB. **Done** (verified 2026-10-02: images build, API migrates and seeds, SPA and `/api` proxy respond) |
| MRV-3.2 | Continuous integration | Pipeline runs `dotnet build/test` and the client build/test on every change (needs Node >= 22.22.3) |
| MRV-3.3 | Production hardening | Secrets via environment/secret store, rate limiting on auth and coverage, JWT key rotation plan, HTTPS (run the `test/runtime/` suite once against an HTTPS endpoint). **Refuse to start in Production** when the JWT key, admin password or DB password still holds a placeholder/example value (`deploy/.env.example` ships working dev values; a straight copy is currently accepted) |
| MRV-3.4 | Exercise geocoding providers against real keys | Azure and Google paths each have a documented smoke test; optional address cache |
| MRV-3.5 | Raise test coverage (a data/security runtime test now exists in `test/runtime/`; add the Chrome UI run to CI) | Integration tests for every controller; frontend service/guard tests |

### Release 2

Reserve and release stock on orders ([#12](https://github.com/GucciVanin/MarviWebsite/issues/12); needs the order lifecycle, warehouse routing and MRV-1.2) • Multi-warehouse routing • polygon coverage areas (ray casting or PostGIS) • inventory tracking with
backorders and per-line status • delivery scheduling • invoices/PDF • returns/RMA • audit-log UI •
reporting dashboards.

### Release 3

Email/SMS notifications • saved carts and reorder • bulk-import enhancements • fine-grained employee
permissions.

## 7. API surface

✔ implemented, ○ in spec but missing. Routes come from `src/Marvi.Api/Features/*`.

| Feature | Endpoint | Auth | Status |
|---|---|---|---|
| Identity | `POST /api/auth/register`, `POST /api/auth/login` | Anonymous | ✔ |
| Catalog | `GET /api/products`, `GET /api/products/{id}`, `GET /api/deals` | Anonymous (tier price when a client token is sent) | ✔ |
| Coverage | `POST /api/coverage/check` | Anonymous | ✔ |
| Quotes | `POST /api/quotes`, `GET /api/quotes/mine`, `POST /api/quotes/{id}/accept` | Client | ✔ |
| Quotes | `POST /api/quotes/{id}/reject` | Client | ✔ |
| Orders | `GET /api/orders/mine` | Client | ✔ |
| Quotes | `GET /api/employee/quotes/queue`, `PUT /api/employee/quotes/{id}/price` | Employee, Admin | ✔ |
| Quotes | `GET /api/employee/quotes/history` (MRV-1.2a: `clientId`, `status`, `from`, `to`, `page`, `pageSize`) | Employee, Admin | ✔ |
| Orders | `POST /api/employee/orders` | Employee, Admin | ✔ |
| Orders | `GET /api/employee/orders/history` (MRV-1.2b: same filters and paging as the quotes history) | Employee, Admin | ✔ |
| Inventory | `GET /api/employee/inventory` | Employee, Admin | ✔ |
| Inventory | `GET /api/employee/inventory/history` | Employee, Admin | ○ |
| Identity | `GET /api/employee/clients/{id}` | Employee, Admin | ✔ |
| Identity | `GET /api/employee/clients?search=` (MRV-2.4b.1: the customer directory) | Employee, Admin | ✔ |
| Identity | `POST /api/admin/employees` | Admin | ✔ |
| Identity | `PUT /api/admin/clients/{id}/approve`, `PUT …/suspend` | Admin | ✔ |
| Identity | `PUT /api/admin/clients/{id}/update-credit` (MRV-1.3: `pricingTierId`, `creditLimit`) | Admin | ✔ |
| Catalog | CRUD `/api/admin/products`, `/api/admin/deals` | Admin | ✔ |
| Catalog | `GET/POST/PUT /api/admin/pricing-tiers`; `GET/PUT/DELETE /api/admin/products/{id}/pricing` | Admin | ✔ |
| Catalog | CRUD `/api/admin/categories` | Admin | ✔ |
| Catalog | `GET /api/categories` | Anonymous | ✔ |
| Catalog | `POST /api/admin/products/import` (MRV-2.1: multipart `file`, `dryRun`, `warehouseId`) | Admin | ✔ |
| Catalog | `GET /api/public/stats` (landing page numbers: active products, active categories, radius coverage areas; cached 60 s) | Anonymous | ✔ |
| Platform | `GET /health` | Anonymous | ✔ |
| Inventory | `PUT /api/admin/inventory` (upsert on-hand and reorder point) | Admin | ✔ |
| Coverage | CRUD `/api/admin/warehouses`, `/api/admin/coverage-areas` | Admin | ✔ |
| Auditing | `GET /api/admin/audit-log` | Admin | ✔ |
| Identity | `GET/PUT /api/client/profile` (MRV-2.2: company name, billing address, shipping addresses) | Client | ✔ |

## 8. Open questions (each blocks the stories that cite it)

- **Q1** — *Resolved (2026-10-02):* one flat row per product. Columns `sku, name, description, category, price, stock`, plus `attr_<name>` columns for attributes and optional `tier_<name>` columns for per-tier prices. Upsert by SKU.
- **Q2** — *Resolved:* clients get immediate access at registration (spec); admins can suspend.
- **Q3** — *Resolved (2026-10-02):* attributes stay flat string key/value pairs; revisit if numeric filtering is needed.
- **Q4** — Delivery scheduling workflow (Release 2). *Deferred:* does not block Sprints 2 or 3.
- **Q5** — *Resolved (2026-10-02):* the owner states they hold permission to use the brand imagery and logos in the mockup. The owner supplies the photos; until they arrive, placeholders fill the image slots.
- **Q6** — *Deferred:* logo files (SVG/PNG of the Exímia crest and MARVI wordmark) to come later; a text wordmark is used meanwhile. Swapping it is a one-file change.
- **Q7** — *Resolved (2026-10-02):* the approximate colors in 10.2 are accepted; update the tokens if a brand guide says otherwise.
- **Q8** — *Resolved (2026-10-02):* "Our Network" shows only the live count of active coverage areas, with no map or region list (polygon data is Release 2).

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Runtime data/security test (2026-10-06) found 15 defects the 75 tests of the time missed** — deleting a product cascaded into order lines (order totals no longer added up); no cascade protection for warehouses/clients; NUL characters, zone-less dates, bad paging and unknown ids caused 500s; deals, warehouses, coverage areas, credit limits, SKUs and emails were not validated; duplicate SKUs allowed; search was case-sensitive; unpriced products showed price 0 | Corrupted financial history, avoidable 500s, nonsense data | All fixed (see architecture.md §11) with 63 new tests (104 API tests in all); a final review pass fixed ten more edge cases (deal update with null lists, undefined enum values, GeoJSON validity, trimming/length limits, delete races, and `run.sh` isolation); the checks are kept in `test/runtime/` and must stay green |
| Remaining known gaps from that run | No brute-force protection on login (12 wrong passwords did not lock the account); coverage check cannot be exercised with real geocoding yet; the SPA is served without security headers (CSP etc.) | Rate limiting and headers in MRV-3.3; real geocoding keys in MRV-3.4 |
| Polygon coverage is not implemented | Release 2 areas unusable | Unit-test point-in-polygon with real area data, or adopt PostGIS |
| Geocoding provider outage or rate limits | Coverage checks fail | Provider abstraction exists; add a result cache (MRV-3.4) |
| Spec/code drift (history endpoints, quote reject, credit) | Wrong behavior shipped | Sprint 3 closes known drift (the UI sprint comes first); section 4 is the checklist |
| Audit coverage depends on each controller calling `AuditLogger` | Silent gaps | Move to a `SaveChanges` interceptor as audited features grow |
| Frontend cannot be built with Node 22.15 (CLI needs >= 22.22.3) | Dev/CI friction | Document and enforce the minimum Node version; client tests run in Docker (see README) |
| ~~The app is zoneless but screens assigned plain fields inside HTTP callbacks~~ **Fixed 2026-10-02** | Data never rendered; portals looked empty though the API worked | All existing screens use signals; regression tests in `storefront.spec.ts`, `client-portal.spec.ts`, `login.spec.ts`. Rule recorded in architecture.md §8 |
| ~~SPA could not see the user's role; quote status arrived as a number~~ **Fixed 2026-10-02** | Every signed-in user was bounced home (no portal reachable) and the Accept button never showed | Client reads the real role claim; enums are serialized by name. Found only by driving the real UI in a browser, so keep a browser smoke run in MRV-3.2/3.5 |
| Code reviews (2026-10-02, three passes) found 18 issues in the new front end and category code; all fixed except two accepted limitations (see architecture.md §11: dangling-deal race; enum attributes kept in Domain) | Skip link left the page; form resets did not render; any DB error mapped to 409; deals accepted unknown categories; legacy-category names could collide; compose password could break the connection string; expired/role-less tokens counted as signed in; wrong claim comment | Fixed with regression tests (41 API + 34 client tests; 29 backend and 29 browser runtime checks); enum-attribute decision kept and enforced by `EveryPublicDomainEnum_IsSerializedByName` |
| Mockup photos show third-party brands (Corona, Coca-Cola, Red Bull, Monster, Schweppes) | Trademark/licensing exposure if shipped | Owner states permission exists (Q5); keep the permission documentation on file, and use placeholders until it is confirmed in writing |
| React island adds a second framework and build | Bundle size, build complexity, two toolchains to keep patched | Keep it to one isolated component with a size budget (10.4); revisit if it grows |
| Landing page depends on categories (MRV-1.6) and the stats endpoint (MRV-2.3b) | Page cannot show live data until both exist | Both are done (MRV-1.6, MRV-2.3b); the page shows static copy in place of the numbers and tiles while loading or if the API fails |

## 10. Front-end design — landing page and design system

Source: the owner's mockup (`docs/design/landing-mockup.png`). Decisions below were agreed with the owner on 2026-10-02.

### 10.1 Decisions

| Topic | Decision |
|---|---|
| Scope | Public landing page (Home) plus a shared design system (tokens, header/footer, primitives) that the auth, storefront and portals adopt later |
| Language | Portuguese (pt-BR) only; all copy lives in one translations file so it is easy to edit. Mockup copy is translated by the developer and reviewed by the owner |
| Styling | Plain SCSS with CSS custom-property tokens; standalone Angular components in `shared/ui`. No Tailwind, no Angular Material |
| Dynamic art | Angular stays the app framework. **One** React island renders the animated hero ribbons (MRV-2.3d); everything else (scroll reveals, count-up stats, flow-arrow animation) is CSS or Angular. No other React |
| Navigation | One landing page; nav items scroll to sections. Header also carries Entrar / Cadastrar buttons (not in the mockup) |
| Calls to action | "Explore our supply" opens the public catalog (anonymous browse with list prices, "Sob consulta" when unpriced; MRV-2.3e). "See how we help businesses grow" goes to register |
| Data | Category tiles and the stats come from the API (MRV-2.3b); the two non-measurable claims stay static copy |
| Imagery | Image slots in the mockup layout, filled with the owner's photos (owner holds permission for the brands shown, Q5); neutral placeholders until the files arrive |
| Logo | Owner supplies SVG/PNG later (Q6); a styled text wordmark is used until then |
| Our Network | Live count of active coverage areas only; no map or region list (Q8) |

### 10.2 Design tokens (approximate, sampled by eye; accepted by the owner, Q7)

| Token | Use | Value |
|---|---|---|
| `--color-navy-900` | Header, hero, stats band, banner background | `#0A1230` |
| `--color-navy-700` | Cards on dark, borders | `#142049` |
| `--color-gold-500` | Accent: headline highlight, eyebrows, CTA arrow, stat icons | `#F5B700` |
| `--color-red-500` | Ribbon, "Replenishment" node | `#D8202F` |
| `--color-blue-600` | Ribbon, "Demand" node | `#1F3FA8` |
| `--color-paper` | Light sections | `#F6F7FA` |
| `--color-text` / `--color-text-inverse` | Body on light / on dark | `#10162F` / `#FFFFFF` |
| Typography | Headings: heavy geometric sans (900/800). Body: regular sans. Eyebrows: small caps, wide letter-spacing (`0.25em`), gold. Load self-hosted, `font-display: swap` (**not done yet**: the app uses the system font stack until the owner picks a font; scroll-reveal animations are also not built) | |
| Radius / spacing | Pill buttons (`999px`), card radius `16px`, 8 px spacing scale, section padding `clamp(3rem, 8vw, 6rem)` | |
| Motion | `--motion-fast 150ms`, `--motion-base 300ms`, `--motion-slow 800ms`; all disabled under `prefers-reduced-motion` | |

### 10.3 Landing page sections (top to bottom)

1. **Header** — logo + wordmark, nav (Início, Produtos, Nossa Rede, Sobre, Por que a Marvi), tagline "Better supply. Stronger together." (translated), Entrar / Cadastrar.
2. **Hero** — eyebrow "Distribution that delivers", headline "Your supply, handled." with the second line in gold, one-sentence subcopy, pill CTA "Explore our supply" (gold arrow circle). Background: image slot + React ribbon animation (red/blue/yellow swoosh, lower left).
3. **Our flow** — four nodes joined by a gradient arrow: Demand, Sourcing, Distribution (centre crest), Replenishment; each with an icon and one line.
4. **Why businesses rely on Marvi** (dark band) — four stats: assortment (live product count, "500+" style), delivery coverage (live active-area count), response time (static), reliability (static). Numbers count up once when scrolled into view.
5. **Our products** — headline, short blurb, six category tiles from the API (mockup: beer, soft drinks, water, energy drinks, mixers, other); each links to the filtered public catalog.
6. **Closing banner** — "Keeping businesses stocked and moving." with CTA to register.
7. **Footer** — not in the mockup: logo, section links, login/register, copyright (to be defined with the owner).

### 10.4 Technical constraints

- **React island:** its own small package built to a single lazy-loaded script (custom element or mount function); target ≤ 60 KB gzipped including React; loaded only on the landing page, after first paint; failure or reduced-motion shows a static SVG of the ribbons. Isolated so it can be deleted without touching Angular code. Built in `client/island`; build step documented in `architecture.md`.
- **Performance:** Largest Contentful Paint ≤ 2.5 s on a mid-range phone over 4G; hero image sized and `fetchpriority="high"`; below-the-fold images lazy-loaded; no layout shift from fonts or images (set dimensions).
- **API:** the two new endpoints are anonymous, cacheable (short `Cache-Control`), return no prices or customer data, and have integration tests (anonymous access works, inactive items excluded).

### 10.5 Responsive and accessibility

- Mobile-first; breakpoints at 640 / 1024 / 1280 px. Nav collapses to a menu button below 1024 px; flow nodes stack vertically on mobile; category tiles scroll or wrap in two columns.
- WCAG 2.2 AA: contrast checked for gold-on-navy and white-on-navy, visible focus rings, semantic landmarks (`header`, `nav`, `main`, `section` with headings), keyboard-operable menu, alt text on informative images, decorative art `aria-hidden`.
- Respect `prefers-reduced-motion`: no ribbon animation, no count-up, no reveal transitions.

### 10.6 Definition of done for the landing page

- Matches the mockup layout at 1280 px and degrades cleanly at 390 px.
- Every section renders with API data and with the API down (static fallback, no blank areas).
- `npx tsc -p tsconfig.app.json --noEmit` and the client build pass; new endpoints covered by `dotnet test`.
- Lighthouse accessibility ≥ 95 and performance ≥ 85 on the production build.
- `architecture.md` documents the design-system folders, tokens location and the React island; this section updated with final values.
