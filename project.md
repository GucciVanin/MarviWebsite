# Marvi — Project Specification & Roadmap

High-level technical spec, organised with SCRUM. Companion documents: [goal.md](goal.md) (why — wins
any conflict), [architecture.md](architecture.md) (how it is built).
Last reviewed: 2026-10-01. Status values: **Done**, **Partial**, **Not started**.

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
| F7 | Quotes: client creates, system auto-prices, employee sets final price, client accepts | Partial | Create / queue / price / accept done. Client **reject** missing (MRV-1.4) |
| F8 | Accepted quote becomes an order | Done | Single operation, `QuoteWorkflowService.AcceptQuote` |
| F9 | Employee places orders directly | Done | Requires client `Approved`; server-side pricing; refuses products with no price for the client's tier |
| F10 | Employee history of quotes, orders, inventory changes | Not started | Only the quote queue and per-client profile exist (MRV-1.2) |
| F11 | Inventory per warehouse (on hand / reserved / reorder point), employee-only | Partial | Employee read endpoint; admin upsert of stock. Orders do not reserve or decrement stock; no history |
| F12 | Admin: suspend client, adjust credit/pricing | Partial | Approve and suspend exist (suspended clients cannot quote or accept); update-credit missing (MRV-1.3) |
| F13 | Admin audit log of mutations | Partial | Written by admin controllers via `AuditLogger`; read endpoint exists; no UI filtering/paging |
| F14 | CSV product import (MVP requirement) | Not started | Schema defined (Q1 resolved) |
| F15 | Home page with the owner's design | Designed, not built | Spec in section 10 (MRV-2.3a–e); `Home` is still an empty placeholder |
| F16 | Client profile management (addresses, company) | Not started | `ShippingAddresses` exists on the entity; no endpoints |

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

**Sprint 2 — Front end, so the product can be used and tested (In progress, started 2026-10-02)**

Why first: the API is ahead of the UI, and the owner cannot exercise the product without screens. Order of work: 2.3a → 2.4a → 2.3e → 2.3b → 2.3c → 2.3d.

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-2.3a | ~~Design system foundation and app shell~~ **Done (2026-10-02)** | Tokens, global styles, shared header (role-aware nav, login/logout) and footer, UI primitives (button, card, field, alert, page container) per section 10; pt-BR strings in one translations file; login and register restyled with them. Every existing route reachable from the header. **Delivered:** SCSS tokens/base/primitives in `client/src/styles`, `core/i18n/pt-br.ts`, `shared/ui` header and footer, app shell with skip link, interim Home, restyled login/register, `AuthService.homeUrl`; **Also fixed, found by runtime tests:** role claim name, enum-as-string API contract, zoneless rendering in storefront and portals (see §9). 17 client tests. Header shows only Início and Produtos for now; MRV-2.3c adds Nossa Rede, Sobre and Por que a Marvi when their sections exist; portals are reachable through the role button (Minha área / Painel / Administração) |
| MRV-2.4a | Usable screens for the core flow | Admin: manage categories, products (with category), pricing tiers, per-tier prices, warehouses/coverage, stock. Client: browse, request a quote, see quotes, accept, see orders. Employee: quote queue and pricing, place an order. Every action surfaces API errors in plain pt-BR; no raw JSON or console-only feedback |
| MRV-2.3e | Public catalog browse | "Explore our supply" opens a catalog anyone can browse (search, filter by category from `GET /api/categories`); anonymous visitors see list prices as the API returns them; links to register for quotes |
| MRV-2.3b | Public landing-page data | `GET /api/categories` (public, active only) and `GET /api/public/stats` (product count, category count, active coverage areas); anonymous, no prices; categories half is done (MRV-1.6) |
| MRV-2.3c | Landing page (Home) | All sections of section 10.3 built from the mockup, wired to MRV-2.3b, responsive and accessible per 10.5 |
| MRV-2.3d | Hero ribbon animation (React island) | Stretch, last in the sprint. Isolated React bundle renders the animated ribbons; lazy-loaded; static fallback for reduced-motion, no-JS and load failure; budget in 10.4 |

**Sprint 3 — Close the MVP spec gaps and data in (Not started)**

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-1.1 | ~~As a client I get immediate access after registering~~ **Done in Sprint 1b** | Implemented per spec (Q2 resolved). Remaining: tests for `Pending` behavior if admin approval is ever re-introduced |
| MRV-1.2 | As an employee I see the full history of quotes, orders and inventory | `GET /api/employee/quotes/history`, `/orders/history`, `/inventory/history` (paged, filterable by client/date); inventory changes are recorded when orders consume stock |
| MRV-1.3 | As an admin I adjust a client's credit and pricing tier | `PUT /api/admin/clients/{id}/update-credit`; audited |
| MRV-1.4 | As a client I can reject a priced quote | `POST /api/quotes/{id}/reject`; only Priced quotes; only the owner |
| MRV-1.5 | ~~Anonymous pricing uses a deliberate list-price tier~~ **Done in Sprint 1b** | `PricingTier.IsDefault` + migration; one default enforced |
| MRV-1.6 | ~~As an admin I manage categories~~ **Done** | `Category` entity (name unique ignoring case, `SortOrder`, `IsActive`); audited CRUD under `/api/admin/categories`; public `GET /api/categories` (active only, with active-product counts); `Product.CategoryId` is a real foreign key and product writes reject unknown categories; delete is blocked with 409 while a product or deal uses the category. Migration `AddCategories` keeps pre-existing orphan `category_id` values by creating an inactive `Legacy <id>` category for each, which an admin can rename and activate. Deals also reject unknown category ids. Concurrent duplicate/delete races return 409 (only for real unique/FK violations; case-insensitive unique index `ix_categories_name_lower`; verified with 12 parallel creates: one 201, eleven 409). Verified on real PostgreSQL |
| MRV-2.1 | As an admin I import products from CSV | Schema agreed (Q1); per-row validation report; idempotent by SKU; audited; lives in the Catalog feature |
| MRV-2.2 | Client profile management | `/api/client/profile` GET/PUT incl. shipping addresses; UI in the client portal |
| MRV-2.4b | Remaining portal parity | Admin and employee UIs cover every endpoint in section 7 not done in MRV-2.4a (history views, update-credit, quote reject, audit log); shared UI extracted into `shared/` |

**Sprint 4 — Make it shippable (Not started)**

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-3.1 | Verify Docker Compose end to end | `docker compose up --build` yields a working SPA → API → DB. **Done** (verified 2026-10-02: images build, API migrates and seeds, SPA and `/api` proxy respond) |
| MRV-3.2 | Continuous integration | Pipeline runs `dotnet build/test` and the client build/test on every change (needs Node >= 22.22.3) |
| MRV-3.3 | Production hardening | Secrets via environment/secret store, rate limiting on auth and coverage, JWT key rotation plan, HTTPS. **Refuse to start in Production** when the JWT key, admin password or DB password still holds a placeholder/example value (`deploy/.env.example` ships working dev values; a straight copy is currently accepted) |
| MRV-3.4 | Exercise geocoding providers against real keys | Azure and Google paths each have a documented smoke test; optional address cache |
| MRV-3.5 | Raise test coverage | Integration tests for every controller; frontend service/guard tests |

### Release 2

Multi-warehouse routing • polygon coverage areas (ray casting or PostGIS) • inventory tracking with
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
| Quotes | `POST /api/quotes/{id}/reject` | Client | ○ |
| Orders | `GET /api/orders/mine` | Client | ✔ |
| Quotes | `GET /api/employee/quotes/queue`, `PUT /api/employee/quotes/{id}/price` | Employee, Admin | ✔ |
| Quotes | `GET /api/employee/quotes/history` | Employee, Admin | ○ |
| Orders | `POST /api/employee/orders` | Employee, Admin | ✔ |
| Orders | `GET /api/employee/orders/history` | Employee, Admin | ○ |
| Inventory | `GET /api/employee/inventory` | Employee, Admin | ✔ |
| Inventory | `GET /api/employee/inventory/history` | Employee, Admin | ○ |
| Identity | `GET /api/employee/clients/{id}` | Employee, Admin | ✔ |
| Identity | `POST /api/admin/employees` | Admin | ✔ |
| Identity | `PUT /api/admin/clients/{id}/approve`, `PUT …/suspend` | Admin | ✔ |
| Identity | `PUT /api/admin/clients/{id}/update-credit` | Admin | ○ |
| Catalog | CRUD `/api/admin/products`, `/api/admin/deals` | Admin | ✔ |
| Catalog | `GET/POST/PUT /api/admin/pricing-tiers`; `GET/PUT/DELETE /api/admin/products/{id}/pricing` | Admin | ✔ |
| Catalog | CRUD `/api/admin/categories` | Admin | ✔ |
| Catalog | `GET /api/categories` | Anonymous | ✔ |
| Catalog | CSV product import | Admin | ○ |
| Catalog | `GET /api/public/stats` (landing page; MRV-2.3b) | Anonymous | ○ |
| Platform | `GET /health` | Anonymous | ✔ |
| Inventory | `PUT /api/admin/inventory` (upsert on-hand and reorder point) | Admin | ✔ |
| Coverage | CRUD `/api/admin/warehouses`, `/api/admin/coverage-areas` | Admin | ✔ |
| Auditing | `GET /api/admin/audit-log` | Admin | ✔ |
| Identity | `GET/PUT /api/client/profile` | Client | ○ |

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
| Landing page depends on categories (MRV-1.6) and the stats endpoint (MRV-2.3b) | Page cannot show live data until both exist | MRV-1.6 is done, so only the stats endpoint (MRV-2.3b) remains; page shows skeletons/static fallback if the API fails |

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
| Calls to action | "Explore our supply" opens the public catalog (anonymous browse, no prices). "See how we help businesses grow" goes to register |
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
| Typography | Headings: heavy geometric sans (900/800). Body: regular sans. Eyebrows: small caps, wide letter-spacing (`0.25em`), gold. Load self-hosted, `font-display: swap` | |
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

- **React island:** its own small package built to a single lazy-loaded script (custom element or mount function); target ≤ 60 KB gzipped including React; loaded only on the landing page, after first paint; failure or reduced-motion shows a static SVG of the ribbons. Isolated so it can be deleted without touching Angular code. Document the build step in `architecture.md` when MRV-2.3d starts.
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
