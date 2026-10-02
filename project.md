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
| F5 | Admin CRUD: products, deals, warehouses, coverage areas, pricing tiers, per-tier product prices | Done | Categories still have no entity or endpoints (MRV-1.6) |
| F6 | Coverage check by address (single warehouse, radius) | Done | Polygon areas throw `NotSupportedException` until Release 2 |
| F7 | Quotes: client creates, system auto-prices, employee sets final price, client accepts | Partial | Create / queue / price / accept done. Client **reject** missing (MRV-1.4) |
| F8 | Accepted quote becomes an order | Done | Single operation, `QuoteWorkflowService.AcceptQuote` |
| F9 | Employee places orders directly | Done | Requires client `Approved`; server-side pricing; refuses products with no price for the client's tier |
| F10 | Employee history of quotes, orders, inventory changes | Not started | Only the quote queue and per-client profile exist (MRV-1.2) |
| F11 | Inventory per warehouse (on hand / reserved / reorder point), employee-only | Partial | Employee read endpoint; admin upsert of stock. Orders do not reserve or decrement stock; no history |
| F12 | Admin: suspend client, adjust credit/pricing | Partial | Approve and suspend exist (suspended clients cannot quote or accept); update-credit missing (MRV-1.3) |
| F13 | Admin audit log of mutations | Partial | Written by admin controllers via `AuditLogger`; read endpoint exists; no UI filtering/paging |
| F14 | CSV product import (MVP requirement) | Not started | Schema undefined (Q1) |
| F15 | Home page with the owner's design | Not started | `Home` is an empty placeholder |
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

**Sprint 2 — Close the MVP spec gaps (Not started)**

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-1.1 | ~~As a client I get immediate access after registering~~ **Done in Sprint 1b** | Implemented per spec (Q2 resolved). Remaining: tests for `Pending` behavior if admin approval is ever re-introduced |
| MRV-1.2 | As an employee I see the full history of quotes, orders and inventory | `GET /api/employee/quotes/history`, `/orders/history`, `/inventory/history` (paged, filterable by client/date); inventory changes are recorded when orders consume stock |
| MRV-1.3 | As an admin I adjust a client's credit and pricing tier | `PUT /api/admin/clients/{id}/update-credit`; audited |
| MRV-1.4 | As a client I can reject a priced quote | `POST /api/quotes/{id}/reject`; only Priced quotes; only the owner |
| MRV-1.5 | ~~Anonymous pricing uses a deliberate list-price tier~~ **Done in Sprint 1b** | `PricingTier.IsDefault` + migration; one default enforced |
| MRV-1.6 | As an admin I manage categories | A Category entity (today `CategoryId` is an orphan Guid), CRUD under `/api/admin/…`, audited. Pricing tiers are done |

**Sprint 3 — Data in, usable portals (Not started)**

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-2.1 | As an admin I import products from CSV | Schema agreed (Q1); per-row validation report; idempotent by SKU; audited; lives in the Catalog feature |
| MRV-2.2 | Client profile management | `/api/client/profile` GET/PUT incl. shipping addresses; UI in the client portal |
| MRV-2.3 | Home page implemented from the owner's design | Uses the public catalog and coverage endpoints |
| MRV-2.4 | Portals reach parity with the API | Admin and employee UIs cover every endpoint in section 7; shared UI extracted into `shared/` |

**Sprint 4 — Make it shippable (Not started)**

| ID | Story | Acceptance criteria |
|---|---|---|
| MRV-3.1 | Verify Docker Compose end to end | `docker compose up --build` yields a working SPA → API → DB. **Done** (verified 2026-10-02: images build, API migrates and seeds, SPA and `/api` proxy respond) |
| MRV-3.2 | Continuous integration | Pipeline runs `dotnet build/test` and the client build/test on every change (needs Node >= 22.22.3) |
| MRV-3.3 | Production hardening | Secrets via environment/secret store, rate limiting on auth and coverage, JWT key rotation plan, HTTPS |
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
| Catalog | CRUD categories; CSV product import | Admin | ○ |
| Inventory | `PUT /api/admin/inventory` (upsert on-hand and reorder point) | Admin | ✔ |
| Coverage | CRUD `/api/admin/warehouses`, `/api/admin/coverage-areas` | Admin | ✔ |
| Auditing | `GET /api/admin/audit-log` | Admin | ✔ |
| Identity | `GET/PUT /api/client/profile` | Client | ○ |

## 8. Open questions (each blocks the stories that cite it)

- **Q1** — CSV import schema: columns, and how attributes, pricing tiers and stock are expressed.
- **Q2** — *Resolved:* clients get immediate access at registration (spec); admins can suspend.
- **Q3** — Constraints on product attribute structure (currently flat string key/value pairs).
- **Q4** — Delivery scheduling workflow (Release 2).

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Polygon coverage is not implemented | Release 2 areas unusable | Unit-test point-in-polygon with real area data, or adopt PostGIS |
| Geocoding provider outage or rate limits | Coverage checks fail | Provider abstraction exists; add a result cache (MRV-3.4) |
| Spec/code drift (history endpoints, quote reject, credit) | Wrong behavior shipped | Sprint 2 closes known drift; section 4 is the checklist |
| Audit coverage depends on each controller calling `AuditLogger` | Silent gaps | Move to a `SaveChanges` interceptor as audited features grow |
| Frontend cannot be built with Node 22.15 (CLI needs >= 22.22.3) | Dev/CI friction | Document and enforce the minimum Node version |
