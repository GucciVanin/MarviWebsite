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
| CPF hash key (MRV-9.4) | `Privacy:CpfHashKey` (`Privacy__CpfHashKey`; compose reads `CPF_HASH_KEY`) | at least 32 random characters, not an example. Set it once and never change it: it makes the stored CPFs unique, so a new key makes every old hash stop matching |
| Data Protection keys folder (MRV-9.4) | `DataProtection:KeysPath` (`DataProtection__KeysPath`) | a folder on a **persistent volume** outside the repository (see section 7). Without it Production refuses to start |

Generate secrets with a password manager or `openssl rand -base64 48`. Keep them in your platform's secret store (for example
Docker/Kubernetes secrets, a cloud key vault) and inject them as environment variables; never commit them. `deploy/.env` is
untracked on purpose.

**`Deployment:AllowExampleSecrets=true` switches the check off.** It exists only so the development compose file and the
runtime test suite can run the same image on the example values. **Do not set it in a real deployment.** If you do not use
`deploy/docker-compose.yml`, you do not need it.

To see the check work: start the API image with the example values and without that flag; it exits at once with
`Refusing to start in Production: ...`.

## 2. Rate limiting (MRV-3.3b)

Sign-in, registration (`/api/auth`), the public coverage check (`/api/coverage/check`, each call may reach the paid
geocoding provider) and the public contact form (`POST /api/public/contact`, MRV-2.8: anyone can post to it, and each message is stored) are limited per client address, in fixed windows; over the limit the API answers `429` with `Retry-After`.
Defaults: 10 requests per 60 s for sign-in (`/api/auth/login`) and **5 per 60 s for registration** (`POST /api/auth/register`, its own policy: a registration is also a CNPJ/CPF probe, MRV-9.4), 30 per 60 s for the coverage check, 5 per 60 s for the contact form, 60 per 60 s for the address writes (`POST/PUT/DELETE /api/client/addresses`, the admin address fix; MRV-9.3). Two more limited endpoints (MRV-9.4): saving the customer's own data (`PUT /api/client/profile`, 20 per 60 s, a Pending customer can change the CPF/CNPJ freely, so this bounds duplicate probing) and the admin's "Mostrar CPF" (10 per 60 s). One more (MRV-9.5): the admin's guided product create (`POST /api/admin/products/with-setup`, 30 per 60 s; `RateLimiting__ProductSetup__PermitLimit`). Tune with `RateLimiting__Register__PermitLimit`, `RateLimiting__Profile__PermitLimit`, `RateLimiting__Reveal__PermitLimit` (each also `...__WindowSeconds`), `RateLimiting__Auth__PermitLimit`,
`RateLimiting__Auth__WindowSeconds`, `RateLimiting__Coverage__PermitLimit`, `RateLimiting__Coverage__WindowSeconds`,
`RateLimiting__Contact__PermitLimit`, `RateLimiting__Contact__WindowSeconds`, `RateLimiting__Addresses__PermitLimit`, `RateLimiting__Addresses__WindowSeconds`.

The limits are keyed on the caller's address. Behind a reverse proxy (the bundled nginx, or your load balancer) the API sees the
proxy's address unless it reads `X-Forwarded-For`; set `ForwardedHeaders__Enabled=true` **only if the API port is reachable
exclusively through your proxy**, otherwise a caller could pick their own address and sidestep the limits. Every hop in front of the API appends an address to `X-Forwarded-For`, and the API takes the one `ForwardedHeaders__ForwardLimit`
hops from the end (default 1: the bundled nginx). With a load balancer or ingress in front of nginx, set it to **2**; left at 1 the API
would see the balancer's address for every visitor, and they would all share one bucket (and without `ForwardedHeaders__Enabled`,
they share nginx's address). Check after deploying: sign in wrongly 11 times from one machine, then from another one.

**Warning:** because the limiter trusts `X-Forwarded-For` once that setting is on, the API port 8080 that the development compose publishes must not be exposed in production: bind it to `127.0.0.1` or do not publish it at all, so only nginx can reach the API.

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
store, not in the repository or the database. **Also back up the Data Protection keys folder** (section 7), **but never in the same archive, bucket or access group as the database backup**: the key ring decrypts every stored CPF, so a combined backup is a ready-made CPF leak. A database backup restored without the keys it was written with leaves every stored CPF unreadable; that is the price of keeping them apart, so test a restore with both.

## 6. Google reviews on the home page (MRV-2.5)

The "Avaliações" section shows the business's Google rating and the reviews the Places API (New) returns. It stays **hidden**
until both settings exist, so an unconfigured site is simply without the section.

| What | Setting (environment variable) |
|---|---|
| Places API (New) key | `Reviews:Google:ApiKey` (`Reviews__Google__ApiKey`; compose reads `GOOGLE_PLACES_API_KEY` from `deploy/.env`) |
| The business's Place ID | `Reviews:Google:PlaceId` (`GOOGLE_PLACE_ID`) |
| How long an answer is kept | `Reviews:CacheMinutes` (default 60; a failure is remembered 5 minutes) |

Set up in Google Cloud: enable **Places API (New)**, create an API key, **restrict it to that API** (and, if your host has a fixed
address, to that address). The key stays on the server: the browser only ever talks to `/api/public/reviews`, and visitors never
reach Google, so cost does not grow with traffic (one request per cache period per API instance). Find the Place ID with Google's
Place ID Finder.

What to expect: Google decides which reviews it returns (at most five, "most relevant") and the section shows them as they come,
a low rating included; the total and the average cover all reviews. Reviews can change on Google at any time. `Reviews:Google:BaseUrl` exists only for tests and local fakes; Production refuses to start with it set, because the key would be sent there. A refresh that fails (5 s timeout, quota, outage) keeps showing the last good answer; a site that never had one hides the section.
A key that is wrong or blocked therefore hides it from the start (the API logs a warning with the status, never the key).

## 7. Customers' registration data and the CPF (MRV-9.4)

A customer registers as a **business** (CNPJ, razão social, inscrições, CNAE, regime...) or as a **person** (CPF and a birth date; 18 or older, because the
company sells alcohol). The CPF is personal data (LGPD): it is stored **encrypted** with ASP.NET Data Protection and next to it a keyed hash (HMAC-SHA256 with
`Privacy:CpfHashKey`) that only enforces "one account per CPF". Staff, the audit trail and the logs see it masked (`***.456.789-**`); an admin sees it in full
only through "Mostrar CPF", which writes an audit entry (the entry itself holds only the mask).

**The Data Protection keys must survive restarts and rebuilds.** They live in the folder `DataProtection:KeysPath`:

- In `deploy/docker-compose.yml` it is `/keys`, the named volume `marvi-dataprotection` (the image creates `/keys` owned by the app user, so a new volume is
  writable). `docker compose down` keeps it; `down -v` deletes it together with the database, which is consistent (no database, no CPFs to read).
- In a real deployment mount a persistent folder (a volume, a mounted secret store path) and point `DataProtection__KeysPath` at it. Keep it **out of the
  repository** (the keys are secrets) and **back it up with the database** (section 5). Lost keys cannot be recovered: stored CPFs would show as
  `***.***.***-**` and "Mostrar CPF" would answer 404, and the customers would have to be asked for their CPF again (an admin types it in the edit panel).
- **Store the key-ring backup apart from the database backups** (a different place with different access); never put both in one archive. The key ring is not encrypted at rest by the application (the folder's permissions are its only protection), and the CPF hash key (`Privacy__CpfHashKey`) is also a secret: with a database dump and that key anyone can try all 10^9 CPFs against the hashes. Keep that key in the secret store, not next to the dump.
- **Pre-production follow-up (not done yet):** protect the key ring itself with a certificate (`ProtectKeysWithCertificate`, ASP.NET Data Protection), so the files in `/keys` are useless without the certificate. Decide this before the first real customer's CPF is stored.
- Keys rotate by themselves every 90 days; old keys stay in the folder and keep decrypting old values. Never delete a key file.
- The runtime suite (`bash test/runtime/run.sh`) restarts the API and proves a stored CPF still decrypts afterwards.

### The hash-key canary (startup check)

The first start after the migration `CpfKeyFingerprint` stores, in the table `app_settings` (`cpf_hash_key_fingerprint`), a keyed fingerprint of `Privacy:CpfHashKey` (it says nothing about any CPF and is not the key). Every later start compares it. **If the key was changed, Production refuses to start** with a message naming `Privacy:CpfHashKey` (restore the original key); outside Production it logs a warning. Changing the key on purpose needs the stored CPFs re-hashed first (decrypt each with the key ring and hash again with the new key, in one maintenance run); there is no tool for that yet, and deleting the `app_settings` row without it only silences the check while old CPFs can register again.

### Registration data and rollback

The migration `ClientRegistrationData` has a working `Down`, but a rollback **drops the columns and with them every customer's registration data** (account type, CNPJ, the encrypted CPF and its hash, birth date, phone, the rest). Take a database backup before rolling back, and expect to collect the data again.

### "Mostrar CPF"

An admin must give a reason (3 to 200 characters) for every reveal; it is written to the audit entry together with the masked CPF (never the number), and the endpoint is rate limited (above). The answer is `no-store`.

### Categorising the existing customers when production is migrated

The migration `ClientRegistrationData` adds the columns and makes **every existing customer a Business account** with no registration data (the development database
is categorised this way too). A customer who is a person must be changed by an admin once, after the deploy:

1. Admin portal, Clientes, **Editar** on the customer, section "Dados cadastrais": choose **Conta pessoal**, confirm the change, type the CPF and birth date
   (the age rule applies) and save. The change is audited (before and after, CPF masked). A customer whose record is already approved cannot do it themselves.
2. For the customers that stay business accounts, fill in the CNPJ and the rest as you receive them; the completeness indicator in the staff views lists what is
   still missing. An incomplete record does not block anything.
3. To list who still has no registration data: `SELECT number, company_name FROM client_accounts WHERE account_type = 0 AND cnpj IS NULL ORDER BY number;`
   (`account_type`: 0 = Business, 1 = Personal). Do not write CPFs with SQL: the column is encrypted, and only the application can write and read it.

