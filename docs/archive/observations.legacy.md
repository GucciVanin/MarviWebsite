# Observations — Phase 1 Implementation

Notes from building the Phase 1 MVP (2026-08-31). Companion to [PLAN.md](PLAN.md) and
[ARCHITECTURE.md](ARCHITECTURE.md) — those describe the intended design, this file tracks where
the actual implementation deviates from it, what's still outstanding, and gotchas worth knowing
before extending the code.

## Deviations from ARCHITECTURE.md

- **`AppDbContext` / `ApplicationUser` location** — ARCHITECTURE.md §2 places `Data/` under
  `Distribution.Api/Data`. They actually live in `Distribution.Infrastructure/Data`, since
  Infrastructure already owns the EF Core/Npgsql packages and Api doesn't reference EF Core
  directly. Harmless, but worth updating the diagram if it causes confusion later.
- **No repository abstraction layer** — Domain services (`PricingService`, `CoverageService`,
  `QuoteWorkflowService`) are pure/stateless and operate on already-loaded entity graphs; they do
  not take repository interfaces. Controllers load data via `AppDbContext` directly and pass it
  into the services. Simpler than what §3 implied, avoided as unnecessary abstraction for this
  scale.
- **`AuditLogger` is not DI-registered** — it's a plain class each Admin controller instantiates
  itself (`new AuditLogger(dbContext, httpContextAccessor)`) rather than being constructor
  injected, to avoid an extra Program.cs registration during parallel agent work. Fine
  functionally, but inconsistent with the rest of the DI-first style — worth registering properly
  if another agent touches these controllers.

## Known follow-ups (not yet done)

- **No `PricingTier.IsDefault` flag.** Anonymous/unauthenticated pricing falls back to
  `PricingTiers.OrderBy(Name).First()` — alphabetically first tier, not a deliberate "list price"
  tier. Needs a real default-tier flag before this is production-correct.
- **Polygon coverage areas are unimplemented.** `CoverageService.CheckCoverage` throws
  `NotSupportedException` for `CoverageAreaType.Polygon` — this was planned as Phase 2, only
  `Radius` works today.
- **Docker Compose stack is unverified end-to-end.** `deploy/docker-compose.yml` +
  `Dockerfile.api` + `Dockerfile.client` + `nginx.conf` were reviewed manually only — no Docker
  CLI was available in the dev sandbox to actually run `docker compose up`.
- **`GoogleMapsGeocodingProvider` exists but is untested** against a real API key (same as
  `AzureMapsGeocodingProvider` — neither has been exercised against a live provider).

## Fixed during implementation

- **Identity roles were never seeded.** A test pass caught that nothing inserted `Client`/
  `Employee`/`Admin` into `AspNetRoles`, so `AddToRoleAsync` would throw
  `InvalidOperationException` on any freshly-migrated database — client self-registration and
  admin employee creation would both hard-fail. Fixed by seeding the three roles in `Program.cs`
  on startup, next to the existing `Database.Migrate()` call.

## Gotchas for future work

- **JWT role claim uses a long URI key, not `"role"`.** `AuthController.Login` builds the token
  via `new JwtSecurityToken(issuer, audience, claims, ...)` (raw claims list), which skips
  outbound claim-type mapping. The role claim's JSON key in the decoded token is
  `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role` (the raw `ClaimTypes.Role` value),
  not `"role"`. The Angular `AuthService` already decodes it correctly with that key — any new
  JWT consumer must do the same.
- **DTO convention**: `Distribution.Api/Contracts/*.cs`, one record per file, `*Request` for
  inputs, `*Dto` for outputs (exception: `AuthResponse`, a token response). Keep new endpoints
  consistent with this.
- **`Microsoft.EntityFrameworkCore.Design` alone does not expose EF Core APIs** to a project —
  `Distribution.Api` only gets `ToListAsync`/`Include`/etc. because `Distribution.Infrastructure`
  references the full `Microsoft.EntityFrameworkCore` package and that flows transitively through
  the project reference.
- **Angular + `HttpClient` params gotcha**: don't pass a ternary between `{ key: value }` and `{}`
  directly as `params` — TypeScript's overload resolution silently picks the wrong `HttpClient.get`
  overload. Build params as a single `Record<string, string> = {}` and conditionally assign into
  it instead (see `products.service.ts`).

## Verification status (2026-08-31)

- `dotnet build Distribution.slnx` — 0 errors, 5 projects.
- `dotnet test test/Distribution.Api.Tests` — 13/13 passing.
- `npm run build` (client/) — succeeds, 0 errors.
