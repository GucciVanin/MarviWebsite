# Client coverage map (MRV-3.5, AC-3)

Every Angular service, guard, interceptor and helper with logic under `client/src/app`, and the spec that covers it. Success = the answer is mapped as expected. Failure = the HTTP error propagates / is described (0, 400, 401, 403, 404, 500) or access is denied. Specs sit in the same folder as the file unless a path is given. Screen (component) specs also exercise the services through the screens; this map lists the dedicated, contract-level spec. "Indirect" in the Gap column means the file was reached only through a component spec and had no spec of its own.

| File | Kind | Spec | Success path | Failure path | Gap before | Gap now |
|---|---|---|---|---|---|---|
| core/auth/auth.service.ts | service | `auth.service.spec.ts`, `auth.service.http.spec.ts` | register, login (token kept, role, home URL, ids), logout, expiry, token decoding (base64url, several roles, no exp) | register and login with 0, 400, 401, 403, 404, 500 stay signed out and keep a previous session; malformed tokens are dropped | register/login requests, decoding edge cases | none |
| core/auth/jwt.interceptor.ts | interceptor | `jwt.interceptor.spec.ts`, `jwt.interceptor.requests.spec.ts` | header only when a token exists (GET/POST/PUT/DELETE), follows login/logout at once, keeps caller headers, passes answers through | 401 signs out, goes to `/login` (also when anonymous) and rethrows the same error; 0, 400, 403, 404, 500 leave the session alone | per method, login/logout transitions, all statuses | none (see Observations) |
| core/auth/role.guard.ts (`clientGuard`, `employeeGuard`, `adminGuard`, `guestGuard`) | guards | `role.guard.spec.ts`, `role.guard.matrix.spec.ts` | allow: right role (employee guard also admits Admin); guest guard lets anonymous and expired through | deny + redirect to `/` for anonymous, other roles, expired, unknown role; guest guard redirects to `/portal`, `/employee`, `/admin`, `/` | Client/Employee matrix, unknown role, expiry between navigations | none |
| core/catalog/catalog.service.ts | service | `catalog.service.spec.ts` | products (no filter, category, trimmed search, blank/empty omitted, both), categories | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/admin-portal/api/admin.service.ts | service | `admin.service.spec.ts` | every endpoint method: method, URL, body, query, answer; import (multipart, dryRun, warehouse, 400 report); audit page (X-Total-Count, header missing/bad, null body) | every method with 0, 400, 401, 403, 404, 500; import keeps a non-report 400 and other statuses as errors | indirect | none |
| features/admin-portal/api/contact-messages.service.ts | service | `contact-messages.service.spec.ts` | POST handle, id escaped | 0, 400, 401, 403, 404, 409, 500 | success only | none |
| features/admin-portal/api/pending-actions.service.ts | service | `pending-actions.service.spec.ts` | GET, total, refresh skipped while loading, force, newest answer wins | 0, 400, 401, 403, 404, 500 keep last data; error cleared on retry | indirect | none |
| features/client-portal/api/orders.service.ts | service | `orders.service.spec.ts` | GET mine (with data, empty) | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/client-portal/api/profile.service.ts | service | `profile.service.spec.ts` | GET, PUT body | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/client-portal/api/quotes.service.ts | service | `quotes.service.spec.ts` | create, mine, reject, accept | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/contact/contact.service.ts | service | `contact.service.spec.ts` | POST body incl. honeypot | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/employee-portal/api/employee.service.ts | service | `employee.service.spec.ts` | queue (status), price, create order, inventory (warehouse), clients search, quote/order history (every filter, empty filters omitted), client | 0, 400, 401, 403, 404, 500 for each | indirect | none |
| features/home/api/google-reviews.service.ts | service | `google-reviews.service.spec.ts` | GET, 204 as null | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/home/api/public-stats.service.ts | service | `public-stats.service.spec.ts` | GET | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/storefront/api/coverage.service.ts | service | `coverage.service.spec.ts` | POST, supported and unsupported | 0, 400, 401, 403, 404, 500 | indirect | none |
| features/storefront/api/deals.service.ts | service | `deals.service.spec.ts` | GET | 0, 400, 401, 403, 404, 500 | indirect | none |
| core/seo/seo.service.ts, core/seo/page-title.strategy.ts | service | `core/seo/seo.spec.ts` | titles, description, noindex, JSON-LD | n/a (no HTTP): placeholders left out, `<` escaped | none | none |
| core/http/loadable.ts | helper | `loadable.spec.ts`, `loadable-states.spec.ts` | states, newest request wins | HTTP statuses become a pt-BR error, last good data kept, error cleared on retry, late failure ignored | error mapping | none |
| core/http/action.ts | helper | `loadable.spec.ts`, `loadable-states.spec.ts` | busy, follow-up, latestOnly | statuses become an error with detail, no follow-up, non-HTTP failure, reset | error mapping | none |
| core/http/api-error.ts | helper | `api-error.spec.ts` | message per status, detail extraction (string, title, message, blank, wrong type) | `hasStatus` for non-HTTP errors; a network error has no detail | no spec | none |
| core/i18n/identity-errors.ts | helper | `identity-errors.spec.ts` | known messages translated | unknown and empty fall back | none | none |
| core/contact/contact-info.ts | helper | `contact-info.spec.ts` | links from real values | placeholders and bad values give no link | none | none |
| shared/crud/admin-crud.ts | helper | `admin-crud.spec.ts` | formFeedback, confirmedDelete | failure shown, no follow-up | none | none |
| shared/format/brl.pipe.ts | pipe | `format-pipes.spec.ts` | pt-BR currency | null/undefined are empty | no spec | none |
| shared/format/pt-date.pipe.ts | pipe | `format-pipes.spec.ts` | local date and time | null, empty, invalid are empty | no spec | none |
| shared/format/number.pipes.ts (`customerNumber`, `documentNumber`, MRV-9.1) | pipe | `format-pipes.spec.ts` | C-000042, Q-000123, P-000045, more than six digits | null, undefined, 0, negative, fractional, NaN are empty (never C-000000) | no spec | none |
| app-wide: no database id in the DOM (MRV-9.1 AC-4) | page scan | `no-ids-on-screen.spec.ts` | 22 routed pages and shells rendered with GUID-seeded API answers; the scan flags a GUID in text or any attribute except `<option>`/`<input>` `value` and `data-testid`; employee order flow, history, basket, category link | the scanner flags a planted GUID in text, href, title, aria-label and id | none | none |
| shared/ui/privacy-notice/privacy-notice-state.ts | service | `privacy-notice-state.spec.ts` (+ `privacy-notice.spec.ts`) | visible, remembered, dismiss | storage read/write blocked | state only via the component | none |
| features/home/hero-ribbons.loader.ts | helper | `hero-ribbons.loader.spec.ts`, `when-idle.spec.ts` | script added once; idle callback and timer fallback | reduced motion, script error | `whenIdle` untested | none |

`core/auth/testing/fake-token.ts` is a test helper (used by the auth specs), not inventoried. A second test-only helper was added: `core/http/testing/http-testing.ts` (`EndpointCase`, `call`, `fail`, `ERROR_STATUSES`; it uses no test globals and is never imported by production code).

## Totals

Inventoried: 27 rows (28 files; SeoService and PageTitleStrategy share a spec, the four guards share a file). Dedicated spec with both a success and a failure path: 4 before (SEO, identity-errors, contact-info, admin-crud), 27 now. 15 files had no spec of their own (12 API services, api-error, the two pipes).

## Observations (no behaviour changed, AC-4)

- `jwtInterceptor` adds the token to every URL, not only `/api`. All calls are relative today; recorded in `docs/work-items/MRV-3.5/decisions.md`.
- `guestGuard` sends a signed-in user with an unknown role to `/`.
