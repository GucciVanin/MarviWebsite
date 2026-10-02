# Marvi — Architecture

Low-level architecture for engineers and AI agents. **Read this before implementing a feature or
changing existing behavior**, and update it in the same change when structure or behavior moves.
Why the product exists: [goal.md](goal.md). What is planned and what is done: [project.md](project.md).

Contents: 1 Rules for agents · 2 System context · 3 Repository map · 4 Backend · 5 Data model ·
6 Authentication · 7 Key flows · 8 Frontend · 9 Deployment · 10 Conventions · 11 Gotchas · 12 How to add or remove a feature

## 1. Rules for agents (read first)

1. **Features are vertical slices.** A feature is the same folder name in the API (`Features/<X>`),
   the domain (`<X>`), and tests (`test/Marvi.Tests/<X>`), plus a portal/feature folder in the SPA.
   Put new code in the feature it belongs to; create a new feature rather than growing an unrelated one.
2. **Dependency direction:** `Api → Domain` and `Api → Infrastructure → Domain`. The domain has no
   ASP.NET, EF Core or HTTP dependency. Never reference `Api` from `Domain`/`Infrastructure`.
3. **Business rules live in `Marvi.Domain/<Feature>/*Service.cs`** as pure, stateless classes that
   operate on already-loaded entities. Controllers load data through `AppDbContext`, call the service,
   and save. There is no repository layer (deliberate; see §11).
4. **Authorization is server-side only.** Every controller carries `[Authorize(Roles=…)]` (or
   `[AllowAnonymous]`) and enforces ownership (`client_id` claim) in code. Angular guards are UX.
5. **Never accept a price from the client.** The SPA sends product ids and quantities; prices come
   from `PricingService` (and employee final prices on quotes).
6. **Admin mutations are audited** through the injected `AuditLogger`.
7. **Schema changes need an EF migration** in `Marvi.Infrastructure/Migrations`.
8. After a change run `dotnet test Marvi.slnx` and (client) `npx tsc -p tsconfig.app.json --noEmit`
   or `npm run build` (needs Node >= 22.22.3).

## 2. System context

```mermaid
flowchart LR
    Visitor([Visitor / Client]) --> SPA
    Employee([Employee]) --> SPA
    Admin([Admin]) --> SPA

    subgraph Browser
        SPA["Angular SPA<br/>client/"]
    end

    subgraph Docker["Docker Compose"]
        Nginx["nginx :4200<br/>static SPA + /api proxy"]
        API["Marvi.Api :8080<br/>ASP.NET Core .NET 10"]
        PG[("PostgreSQL 16<br/>:5432")]
    end

    Geo["Azure Maps or Google Maps<br/>(geocoding)"]

    SPA -- "HTTP /api/*  JWT bearer" --> Nginx
    Nginx -- proxy --> API
    API -- "EF Core / Npgsql" --> PG
    API -- "HTTPS, API key server-side" --> Geo
```

## 3. Repository map

```
Marvi.slnx
global.json                   .NET SDK 10.0.100 (rollForward latestMinor)
goal.md · project.md · architecture.md · README.md
docs/archive/                 superseded plan documents (history only; do not treat as spec)
src/
  Marvi.Api/                  HTTP host
    Program.cs                composition root only
    Features/<Feature>/       *Controller.cs, Contracts/ (one record per file), <Feature>Module.cs
  Marvi.Domain/<Feature>/     entities, enums, pure business services
  Marvi.Infrastructure/
    Data/                     AppDbContext, ApplicationUser
    Geocoding/                IGeocodingProvider + Azure/Google implementations
    DependencyInjection/      AddInfrastructure(...)
    Migrations/               EF Core migrations
  Marvi.Shared/               empty placeholder (candidate for removal)
test/Marvi.Tests/<Feature>/   unit + integration tests; Support/ holds MarviApiFactory, fakes
client/src/app/               core/ · shared/ · features/<feature>/
deploy/                       Dockerfile.api, Dockerfile.client, nginx.conf, docker-compose.yml
```

## 4. Backend

### 4.1 Layers and project references

```mermaid
flowchart TD
    Api["Marvi.Api<br/>controllers, contracts, modules"]
    Infra["Marvi.Infrastructure<br/>EF Core, Identity, geocoding"]
    Domain["Marvi.Domain<br/>entities, enums, business services"]
    Tests["Marvi.Tests<br/>xUnit"]
    Shared["Marvi.Shared<br/>(empty)"]

    Api --> Domain
    Api --> Infra
    Api --> Shared
    Infra --> Domain
    Tests --> Api
```

### 4.2 Feature map

```mermaid
flowchart LR
    subgraph Identity
        I1[AuthController]
        I2[AdminClientsController]
        I3[AdminEmployeesController]
        I4[EmployeeClientsController]
        I5[JwtTokenService]
    end
    subgraph Catalog
        C1[ProductsController]
        C2[DealsController]
        C3[AdminProductsController]
        C4[AdminDealsController]
        C5[PricingService]
    end
    subgraph Coverage
        V1[CoverageController]
        V2[AdminWarehousesController]
        V3[AdminCoverageAreasController]
        V4[CoverageService]
    end
    subgraph Quotes
        Q1[QuotesController]
        Q2[EmployeeQuotesController]
        Q3[QuoteWorkflowService]
    end
    subgraph Orders
        O1[OrdersController]
        O2[EmployeeOrdersController]
    end
    subgraph Inventory
        N1[EmployeeInventoryController]
    end
    subgraph Auditing
        A1[AdminAuditLogController]
        A2[AuditLogger]
    end

    C1 & O2 & Q1 --> C5
    Q1 & Q2 --> Q3
    V1 --> V4
    I2 & I3 & C3 & C4 & V2 & V3 --> A2
```

Cross-feature coupling that exists today (keep it minimal): Orders and Quotes call `PricingService`;
`QuoteWorkflowService.AcceptQuote` creates an `Order`; admin controllers in Identity/Catalog/Coverage
use `AuditLogger`; all features share `AppDbContext`.

### 4.3 Composition (`Program.cs`)

1. `AddControllers`, `AddOpenApi`, `AddInfrastructure(config)`.
2. One call per feature module: `AddIdentityFeature(config)` (JWT bearer validation, authorization,
   `JwtTokenService`, role seeding helper), `AddCatalogFeature` (`PricingService`),
   `AddCoverageFeature` (`CoverageService`), `AddQuotesFeature` (`QuoteWorkflowService`),
   `AddAuditingFeature` (`AuditLogger`, `IHttpContextAccessor`). Controllers are discovered by
   convention, so they need no registration.
3. CORS policy `SpaClient` (origin `Cors:AllowedOrigin`, default `http://localhost:4200`).
4. Pipeline: HTTPS redirection → CORS → authentication → authorization → controllers.
5. Outside the `Testing` environment on startup: apply migrations, `IdentityModule.SeedRolesAsync` (creates `Client`,
   `Employee`, `Admin`), `IdentityModule.SeedAdminAsync` (first admin from config), and
   `DefaultPricingTier.GetOrCreateAsync` (ensures one default tier, "Standard"). Tests run the same seeding via `MarviApiFactory`.

`AddInfrastructure` registers `AppDbContext` (Npgsql, snake_case naming), ASP.NET Core Identity
(`ApplicationUser`, `IdentityRole<Guid>`), a singleton `HttpClient`, and the `IGeocodingProvider`
chosen by `Geocoding:Provider` (`Google`, otherwise Azure Maps).

### 4.4 Business services (domain)

| Service | Responsibility |
|---|---|
| `PricingService.ResolvePrice(product, tier, pricingRows, activeDeals, qty)` | Tier unit price by quantity break (rows unique per product + tier + `MinQty`), then best active deal → `PricingResult`; throws `InvalidOperationException` when the tier has no price for the product |
| `CoverageService.CheckCoverage(lat, lng, areas)` | Radius check by haversine distance; `Polygon` throws `NotSupportedException` |
| `QuoteWorkflowService` | `CreateQuote`, `PriceQuote` (Submitted → Priced; every line needs a non-negative final price; employee id nullable for admins), `AcceptQuote` (Priced → Accepted, returns the new `Order`); invalid transitions throw `InvalidOperationException` |

### 4.5 State machines

```mermaid
stateDiagram-v2
    direction LR
    state "Quote" as Q {
        [*] --> Submitted: client creates
        Submitted --> Priced: employee prices
        Priced --> Accepted: client accepts (creates Order)
        Priced --> Rejected: planned (MRV-1.4)
        Submitted --> Expired: enum exists, no transition yet
    }
```

```mermaid
stateDiagram-v2
    direction LR
    state "ClientAccount" as C {
        [*] --> Approved: register (default tier assigned)
        Approved --> Suspended: admin suspend
        Suspended --> Approved: admin approve
        Pending --> Approved: admin approve (legacy value, unused by registration)
    }
```

`OrderStatus` values: `Placed`, `Backordered`, `Fulfilled`, `Cancelled`. `QuoteStatus` also has `Draft`
(unused by current flows). Orders are created as `Placed`.

## 5. Data model

Tables are snake_case plurals via `UseSnakeCaseNamingConvention()`. `Product.Attributes`,
`AuditLogEntry.Details` (string dictionaries) and `CoverageArea.PolygonGeoJson` use `jsonb`.

```mermaid
erDiagram
    ApplicationUser ||--o| ClientAccount : "has (Client role)"
    ApplicationUser ||--o| EmployeeAccount : "has (Employee role)"
    PricingTier ||--o{ ClientAccount : "assigned to"
    PricingTier ||--o{ ProductPricing : prices
    Product ||--o{ ProductPricing : "priced by tier"
    Product ||--o{ InventoryRecord : "stocked as"
    Warehouse ||--o{ InventoryRecord : holds
    Warehouse ||--o{ CoverageArea : serves
    ClientAccount ||--o{ Quote : requests
    EmployeeAccount ||--o{ Quote : prices
    Quote ||--o{ QuoteLineItem : contains
    Product ||--o{ QuoteLineItem : references
    ClientAccount ||--o{ Order : places
    EmployeeAccount ||--o{ Order : "places for client"
    Quote ||--o| Order : "converted to"
    Warehouse ||--o{ Order : fulfils
    Order ||--o{ OrderLineItem : contains
    Product ||--o{ OrderLineItem : references

    ClientAccount {
        guid Id
        guid UserId
        string CompanyName
        string BillingAddress
        decimal CreditLimit
        guid PricingTierId
        enum Status
    }
    EmployeeAccount {
        guid Id
        guid UserId
        string EmployeeCode
        string Department
        datetime HireDate
    }
    Product {
        guid Id
        string Sku
        string Name
        guid CategoryId
        bool IsActive
        jsonb Attributes
    }
    ProductPricing {
        guid ProductId
        guid PricingTierId
        decimal UnitPrice
        int MinQty
    }
    Deal {
        guid Id
        string Name
        enum DiscountType
        decimal DiscountValue
        datetime StartDate
        datetime EndDate
        int MinQty
    }
    Warehouse {
        guid Id
        string Name
        string Address
        double Latitude
        double Longitude
    }
    CoverageArea {
        guid WarehouseId
        enum Type
        double RadiusMiles
        jsonb PolygonGeoJson
    }
    InventoryRecord {
        guid ProductId
        guid WarehouseId
        int QtyOnHand
        int QtyReserved
        int ReorderPoint
    }
    Quote {
        guid Id
        enum Status
        datetime CreatedAt
        guid PricedByEmployeeId
    }
    Order {
        guid Id
        guid QuoteId
        enum Status
        string DeliveryAddress
        guid WarehouseId
        guid PlacedByEmployeeId
        decimal TotalAmount
    }
    AuditLogEntry {
        guid ActorUserId
        string Action
        string EntityName
        guid EntityId
        datetime Timestamp
        jsonb Details
    }
```

Not drawn as relationships because they are plain id lists: `Deal.ProductIds`, `Deal.CategoryIds`,
and `Product.CategoryId` (no `Category` entity exists yet; MRV-1.6). `ClientAccount.ShippingAddresses`
is a string list column. `AuditLogEntry.ActorUserId` is not a foreign key.

## 6. Authentication and authorization

```mermaid
sequenceDiagram
    participant SPA
    participant Auth as AuthController
    participant Id as Identity UserManager
    participant JWT as JwtTokenService
    participant API as Any controller

    SPA->>Auth: POST /api/auth/register
    Auth->>Id: CreateAsync + AddToRole Client
    Auth->>Auth: insert ClientAccount (Status=Approved, default PricingTier)
    Auth-->>SPA: 201 { id }

    SPA->>Auth: POST /api/auth/login
    Auth->>Id: FindByEmail + CheckPassword
    Auth->>Auth: claims: sub, role, client_id or employee_id
    Auth->>JWT: CreateToken(claims)
    JWT-->>Auth: token, expiresAt (1 hour)
    Auth-->>SPA: { token, expiresAt }

    SPA->>API: Authorization: Bearer token
    API->>API: validate signature, issuer, audience, lifetime
    API->>API: Authorize(Roles) and ownership check
```

- Roles: `Client`, `Employee`, `Admin`. Only `POST /api/admin/employees` creates an Employee user.
- Claims: `sub` (user id), role, and `client_id` or `employee_id`.
- The role claim key is the long URI `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role`
  (`ClaimTypes.Role`), not `"role"`. The SPA's `AuthService` decodes it; any new JWT consumer must too.
- Settings: `Jwt:Key`, `Jwt:Issuer` (`Marvi.Api`), `Jwt:Audience` (`Marvi.Client`). No refresh tokens.
- `ClientAccountStatus`: registration yields `Approved`. `Suspended` clients cannot create or accept quotes (`QuotesController`); employee orders require `Approved`.
- **Admins have no employee account**, so no `employee_id` claim. Employee-area endpoints accept Admin and record a null employee (`Quote.PricedByEmployeeId`, `Order.PlacedByEmployeeId`).
- **First admin:** created at startup from `Seed:AdminEmail` / `Seed:AdminPassword` (dev values in `appsettings.Development.json` and `deploy/docker-compose.yml`; set your own elsewhere). Without them no Admin exists.

## 7. Key flows

### 7.1 Catalog pricing

```mermaid
sequenceDiagram
    participant SPA as Storefront
    participant P as ProductsController
    participant DB as AppDbContext
    participant PS as PricingService

    SPA->>P: GET /api/products?category=&search=
    P->>DB: products, pricing rows, active deals
    alt token has client_id
        P->>DB: client's PricingTier
    else anonymous
        P->>DB: default tier (PricingTier.IsDefault)
    end
    P->>PS: ResolvePrice(product, tier, rows, deals, qty)
    PS-->>P: PricingResult
    P-->>SPA: ProductListItemDto[] (price, dealName, inStock)
```

### 7.2 Coverage check

```mermaid
sequenceDiagram
    participant SPA
    participant C as CoverageController
    participant G as IGeocodingProvider
    participant DB as AppDbContext
    participant CS as CoverageService

    SPA->>C: POST /api/coverage/check { address }
    C->>G: Geocode(address)
    G-->>C: lat, lng (or failure)
    C->>DB: warehouses and coverage areas
    C->>CS: CheckCoverage(lat, lng, areas)
    CS-->>C: supported, warehouse
    C-->>SPA: CoverageCheckResultDto
```

### 7.3 Quote to order

```mermaid
sequenceDiagram
    participant Client as Client portal
    participant QC as QuotesController
    participant EQ as EmployeeQuotesController
    participant QS as QuoteWorkflowService
    participant DB as AppDbContext

    Client->>QC: POST /api/quotes { lineItems: productId, qty }
    QC->>QS: CreateQuote (prices suggested via PricingService)
    QC->>DB: save quote (Submitted)
    EQ->>DB: GET queue (Submitted)
    EQ->>QS: PriceQuote(employeeId, final prices)
    EQ->>DB: save (Priced)
    Client->>QC: POST /api/quotes/{id}/accept
    QC->>QS: AcceptQuote(quote)
    QS-->>QC: new Order (final prices copied)
    QC->>DB: save quote (Accepted) + order
    QC-->>Client: OrderDto
```

### 7.4 Employee order and admin audit

`EmployeeOrdersController.Create` loads the client, requires `Approved`, prices each line with
`PricingService` using that client's tier, and saves an `Order` with `PlacedByEmployeeId`.
Admin controllers save the change, then call `AuditLogger.LogAsync(action, entityName, entityId, details)`,
which writes an `AuditLogEntry` with the actor taken from the JWT `sub` claim.

## 8. Frontend (`client/`)

Angular (standalone components, signals, functional guards/interceptors), SCSS, Vitest.
Angular project name: `marvi-client`; build output `dist/marvi-client/browser`.

```
src/app/
  app.ts · app.html (<router-outlet />) · app.config.ts · app.routes.ts
  core/auth/                AuthService, jwt.interceptor.ts, role.guard.ts
  shared/models/            types used by more than one feature (quote.model.ts, order.model.ts)
  features/
    home/                   placeholder awaiting the owner's design
    auth/login/             login page
    storefront/             public catalog, deals, coverage checker  + api/ (products, deals, coverage)
    client-portal/          quotes and orders for clients           + api/ (quotes, orders)
    employee-portal/        quote queue, order taking, lookups      + api/ (employee)
    admin-portal/           people, catalog, coverage, audit        + api/ (admin)
```

```mermaid
flowchart TD
    Root["app.routes.ts<br/>lazy loadChildren"]
    Root -- "''" --> Home[features/home]
    Root -- login --> Auth[features/auth]
    Root -- storefront --> Store[features/storefront]
    Root -- portal --> CP["features/client-portal<br/>clientGuard"]
    Root -- employee --> EP["features/employee-portal<br/>employeeGuard"]
    Root -- admin --> AP["features/admin-portal<br/>adminGuard"]
    Core["core/auth<br/>AuthService, jwtInterceptor, role guards"]
    CP & EP & AP -.-> Core
    CP & EP -.-> Shared["shared/models"]
```

- Each feature owns a `<feature>.routes.ts`, its components and an `api/` folder of `HttpClient`
  services (relative URLs under `/api`). Cross-feature types go in `shared/models`.
- `jwtInterceptor` adds the bearer token and handles 401. Guards are `clientGuard`, `employeeGuard`
  (Employee or Admin) and `adminGuard`; the token is stored in `localStorage` as `marvi_auth_token`.
- Build with `npm run build`. Do not pass a ternary between `{key: v}` and `{}` as `HttpClient`
  `params` (wrong overload); build a `Record<string, string>` and assign conditionally (see
  `products.service.ts`).

## 9. Deployment

```mermaid
flowchart LR
    Browser --> Nginx["client (nginx) :4200"]
    Nginx -- "/api/ proxy_pass" --> Api["api :8080"]
    Api --> Pg[("postgres:16 :5432<br/>db/user/password: marvi")]
    Api -- HTTPS --> Geo["Geocoding provider"]
```

- `docker-compose.yml` builds `postgres`, `api` (`Dockerfile.api`: SDK build → ASP.NET runtime) and
  `client` (`Dockerfile.client`: Node build → nginx, config from `nginx.conf`).
- In compose the browser sees one origin, so CORS matters only for `ng serve` at :4200 against :5083.
- `.dockerignore` (root, for the API image) and `client/.dockerignore` keep host `bin/obj` and `node_modules` out of build contexts.
- Migrations run automatically at API startup. The compose stack is verified end to end (MRV-3.1). Configuration (`Jwt:Key`, geocoding key, DB credentials) must be overridden for production.

## 10. Conventions

- **API contracts:** one `record` per file in `Features/<X>/Contracts`; `*Request` for inputs,
  `*Dto` for outputs (exception: `AuthResponse`). Namespace equals folder path.
- **Controllers:** `[ApiController]`, route `api/<area>/…`, constructor-injected `AppDbContext`
  and services. Admin routes live under `api/admin`, employee routes under `api/employee`.
- **Modules:** a feature that needs DI registrations exposes `Add<X>Feature(this IServiceCollection)`
  in `<X>Module.cs` and is called from `Program.cs`.
- **Domain:** C# `class` entities with public setters (EF Core), enums stored as defined; services
  are pure and unit-tested in `test/Marvi.Tests/<Feature>`.
- **Tests:** integration tests use `MarviApiFactory` (EF InMemory + `FakeGeocodingProvider`,
  environment `Testing`, which skips migration/seed; the factory seeds roles itself).
- **Frontend:** standalone components, one `*.routes.ts` per feature, no business/price logic.
- **Formatting:** `.editorconfig` and Prettier in `client/`.

## 11. Gotchas and deliberate decisions

- **No repository layer.** `AppDbContext` is used directly by controllers; domain services stay pure.
- **`Marvi.Api` shows `Microsoft.EntityFrameworkCore.Design` but gets EF Core APIs
  transitively** from `Marvi.Infrastructure`; do not remove that reference chain.
- **Polygon coverage is unimplemented** and throws; only `Radius` works.
- **Geocoding providers are untested against live keys.**
- **Orders do not touch inventory:** no reservation, decrement or stock check yet (Release 2); `Order.WarehouseId` and
  quote-to-order delivery address are not populated by the quote flow.
- **`Quote.Draft`/`Expired` and `Order.Backordered/Fulfilled/Cancelled`** exist as enum values with
  no workflow yet.
- **`Marvi.Shared` and `Marvi.Infrastructure/Class1.cs`** are empty template leftovers.
- **Default tier:** exactly one `PricingTier.IsDefault` (unique filtered index). Anonymous visitors and new clients use it; pre-flag data is self-healed by promoting the alphabetically first tier on startup/registration.
- **Missing price is not free:** quotes leave `SuggestedUnitPrice` null for unpriced products (the employee must set it); employee orders reject them with 400.
- **There is no rate limiting** on any endpoint (planned in MRV-3.3).

## 12. How to add or remove a feature

**Add `Foo`:**
1. `src/Marvi.Domain/Foo/` — entities, enums, services; add `DbSet`s and mappings in `AppDbContext`; add a migration.
2. `src/Marvi.Api/Features/Foo/` — controllers, `Contracts/`, and `FooModule.cs` with `AddFooFeature`; call it in `Program.cs`.
3. `test/Marvi.Tests/Foo/` — service tests and integration tests via `MarviApiFactory`.
4. `client/src/app/features/foo/` — `foo.routes.ts`, components, `api/` services; add a lazy route in `app.routes.ts`; guard it if role-restricted.
5. Update this file (feature map, data model, flows) and `project.md` (status, API table).

**Remove `Foo`:** delete the four folders above, the `AddFooFeature` line and the lazy route, remove its
`DbSet`s and add a migration dropping its tables, then fix any cross-feature references listed in §4.2.
