# MRV-9.2 security review

Verdict: PASS (no high or critical findings; 2 low, 1 info).

## Checks
1. ContactEmail: `ClientProfileDto` is used only by `EmployeeClientsController` (GET {id}, GET by-number/{n}), class-level `[Authorize(Roles = "Employee,Admin")]`. No other controller, no customer-facing DTO (client/profile, quotes, orders) uses it. Runtime test asserts the customer's own profile lacks the e-mail. Pass. The default `= null` parameter is a minor risk of accidental omission, not a leak.
2. staffPageGuard / `/employee/clientes/:number`: expired or missing token -> /login, customer -> own homeUrl (internal computed), unknown role -> '/'. Fixed internal targets, no query input reflected, no open redirect. The guard is UX only; the API enforces roles. Pass.
3. Widget: no innerHTML/bypassSecurity; all values via interpolation. Link has `target=_blank rel="noopener noreferrer"`; URL built with routerLink from a numeric `formatCustomerNumber` (encoded segment). Pass.
4. `?cliente=`: parsed by `parseCustomerNumber` (`^(C-)?\d{1,9}$`, >0) before any API call; invalid is ignored. Pass.
5. Audit tooling: uses existing seeded demo credentials (same as before, pre-existing in repo), only fetch to `${BASE}/api/auth/login`; no new outbound calls. BASE default is host.docker.internal; axe.mjs BASE comes from env (pre-existing, unchanged). Pass.
6. Logging: no logging added or present of the e-mail in the controller. Pass.

## Findings
- LOW: `CustomerLookupService` (providedIn root, `client/src/app/shared/ui/customer-lookup/customer-lookup.service.ts`) cache is not cleared on `AuthService.logout()`. In-memory only (lost on reload); a second staff user signing in without reload would see the previous user's cached profiles (incl. e-mail) and possibly stale data. Both roles have identical read rights on this data, and customers cannot reach the widget, so no privilege gain. Fix: clear the map on logout (e.g. effect on the token signal) or key by user.
- LOW: the cache never expires within a session, so status/e-mail changes are not reflected until `forget` (which nothing calls) or reload. Correctness, not security.
- INFO: `ContactEmail` is PII shown to all staff; ensure this is intended in the privacy notice. No logging of it.
