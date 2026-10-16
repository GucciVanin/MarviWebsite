# Operations: running Marvi for real

This is for whoever deploys and runs Marvi. The repository ships working **development** values so that everything runs locally
(`deploy/.env.example`, `appsettings.json`); none of them may reach a real deployment.

## 1. Secrets (MRV-3.3a)

The API image is Production by default, and **in Production it refuses to start** while a secret still holds an example or weak
value. It lists every problem at once, names the setting, and never prints a value. Settings are ASP.NET configuration keys; in a
container, set them as environment variables (`:` becomes `__`).

| What | Setting (environment variable) | Must be |
|---|---|---|
| JWT signing key | `Jwt:Key` (`Jwt__Key`) | at least 32 random characters, not an example (no "change-me", "dev-only", "placeholder") |
| First admin's e-mail | `Seed:AdminEmail` (`Seed__AdminEmail`) | a real address, not `@marvi.local` |
| First admin's password | `Seed:AdminPassword` (`Seed__AdminPassword`) | at least 12 characters, not an example. The admin is created only when both are set; after the first start you may remove both |
| Database password | `PGPASSWORD`, or `Password=` in `ConnectionStrings:AppDb` | at least 12 characters, not `marvi`, `postgres`, `password`... |
| Public address of the site | `Cors:AllowedOrigin` (`Cors__AllowedOrigin`) | the `https://` address of the site |

Generate secrets with a password manager or `openssl rand -base64 48`. Keep them in your platform's secret store (for example
Docker/Kubernetes secrets, a cloud key vault) and inject them as environment variables; never commit them. `deploy/.env` is
untracked on purpose.

**`Deployment:AllowExampleSecrets=true` switches the check off.** It exists only so the development compose file and the
runtime test suite can run the same image on the example values. **Do not set it in a real deployment.** If you do not use
`deploy/docker-compose.yml`, you do not need it.

To see the check work: start the API image with the example values and without that flag; it exits at once with
`Refusing to start in Production: ...`.

## 2. Rate limiting (MRV-3.3b)

Sign-in, registration (`/api/auth`) and the public coverage check (`/api/coverage/check`, each call may reach the paid
geocoding provider) are limited per client address, in fixed windows; over the limit the API answers `429` with `Retry-After`.
Defaults: 10 requests per 60 s for `/api/auth`, 30 per 60 s for the coverage check. Tune with `RateLimiting__Auth__PermitLimit`,
`RateLimiting__Auth__WindowSeconds`, `RateLimiting__Coverage__PermitLimit`, `RateLimiting__Coverage__WindowSeconds`.

The limits are keyed on the caller's address. Behind a reverse proxy (the bundled nginx, or your load balancer) the API sees the
proxy's address unless it reads `X-Forwarded-For`; set `ForwardedHeaders__Enabled=true` **only if the API port is reachable
exclusively through your proxy**, otherwise a caller could pick their own address and sidestep the limits. Every hop in front of the API appends an address to `X-Forwarded-For`, and the API takes the one `ForwardedHeaders__ForwardLimit`
hops from the end (default 1: the bundled nginx). With a load balancer or ingress in front of nginx, set it to **2**; left at 1 the API
would see the balancer's address for every visitor, and they would all share one bucket (and without `ForwardedHeaders__Enabled`,
they share nginx's address). Check after deploying: sign in wrongly 11 times from one machine, then from another one.

The development compose
file sets this and raises the limits so the test suites can sign in at machine speed; **do not copy those two lines to production.**

## 3. HTTPS and security headers (MRV-3.3c)

`deploy/nginx.conf` sends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and a
Content-Security-Policy that only allows the site's own scripts, styles, fonts and API (`'unsafe-inline'` for styles only, which Angular
needs). When fonts, analytics or a map are added, widen the policy deliberately.

TLS is terminated **in front of** the containers (a load balancer, Caddy/Traefik, or your platform's ingress), not inside them.
That endpoint must redirect http to https and send `Strict-Transport-Security: max-age=31536000; includeSubDomains` (left out of
nginx.conf on purpose: it is meaningless over plain http and dangerous to enable before https works everywhere). Set
`Cors__AllowedOrigin` to that https address; the API refuses to start otherwise.

## 4. Rotating the JWT signing key

Tokens are signed with `Jwt:Key`. To rotate (suspected leak, or a person with access left): generate a new key, set `Jwt__Key`,
restart the API. Every signed-in user and admin is signed out and signs in again; nothing else is lost. There is no overlap
window, so do it at a quiet hour. After a leak, also rotate the admin password and review the audit log (admin portal, Auditoria).

## 5. What to back up

Everything that matters is in PostgreSQL (the `marvi-db-data` volume in compose): accounts, catalog, stock, quotes, orders and the
audit trail. Back up the database (`pg_dump` nightly, plus a copy off the machine) and test a restore. Secrets live in your secret
store, not in the repository or the database.
