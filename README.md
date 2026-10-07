# Marvi

A wholesale distribution platform: public catalog and coverage check, client quotes and orders,
an employee order-taking portal, and an admin portal.

| Document | Read it for |
|---|---|
| [goal.md](goal.md) | Why the project exists (executive level, non-technical). The ultimate goal. |
| [project.md](project.md) | Scope, requirements, SCRUM roadmap, backlog and current status. |
| [architecture.md](architecture.md) | How the system is built, with diagrams. **Read before changing code.** |

Stack: ASP.NET Core (.NET 10) API, PostgreSQL 16, Angular SPA, Docker Compose.

## Repository layout

```
Marvi.slnx             Solution (src/ + test/)
src/Marvi.Api/         HTTP layer — Features/<Feature>/ (controllers, contracts, module)
src/Marvi.Domain/      Entities, enums, business rules — <Feature>/
src/Marvi.Infrastructure/  EF Core/Postgres, Identity, geocoding providers, migrations
src/Marvi.Shared/      Empty placeholder project (candidate for removal)
test/Marvi.Tests/      xUnit unit + integration tests, organised by feature
test/runtime/          data + security runtime test against the real stack (see its README)
client/                Angular SPA — src/app/{core,shared,features}
deploy/                Dockerfiles, nginx.conf, docker-compose.yml
docs/archive/          Superseded planning documents (history only)
```

## Run it

Everything in containers (API :8080, SPA :4200; Postgres stays internal). First copy the secrets template:

```bash
cp deploy/.env.example deploy/.env   # then edit the values
docker compose -f deploy/docker-compose.yml up --build
```

Client unit tests (the Angular CLI needs Node >= 22.22.3; this runs them in a Node 22 image instead):

```bash
docker build -f deploy/Dockerfile.client --target build --build-context deploy=deploy -t marvi-client-build client
docker run --rm marvi-client-build npx ng test --watch=false
```

To run the API from the IDE against the compose database, publish Postgres on localhost with the opt-in file:

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.dev-db.yml up -d postgres
```

Locally, with a Postgres matching `ConnectionStrings:AppDb` in `src/Marvi.Api/appsettings.json`
(database/user/password `marvi`):

```bash
dotnet run --project src/Marvi.Api          # http://localhost:5083
cd client && npm install && npm start       # http://localhost:4200
```

Tests and builds:

```bash
dotnet test Marvi.slnx
cd client && npm run build
```

The Angular CLI in `client/` requires Node >= 22.22.3 (or 24.15+/26+).

## First login

The API creates an Admin at startup from `Seed:AdminEmail` / `Seed:AdminPassword`. Development values live in
`src/Marvi.Api/appsettings.Development.json` and `deploy/.env.example` — change them for anything real. Sign in as that admin to
create employees, products, per-tier prices (`/api/admin/products/{id}/pricing`), warehouses and stock; clients register themselves at
`/register` and get access immediately.

## Database migrations

```bash
dotnet tool restore
ASPNETCORE_ENVIRONMENT=Testing dotnet dotnet-ef migrations add <Name> --project src/Marvi.Infrastructure --startup-project src/Marvi.Api
```

(`Testing` stops the API from applying migrations while EF builds the host.)

## Configuration

`src/Marvi.Api/appsettings.json` holds development placeholders. Before any real deployment replace
`Jwt:Key` and `Geocoding:AzureMaps:ApiKey` (or set `Geocoding:Provider` to `Google`) through
environment variables or a secret store, and change the Postgres credentials in `deploy/.env`.
