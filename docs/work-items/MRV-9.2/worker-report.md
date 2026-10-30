# Worker report MRV-9.2 (issue #53)

**Verdict: complete.** Nothing committed or pushed. Dev stack left up (client rebuilt with the final code); dev DB untouched (sign-in only; no forms submitted).

## Files changed
- New widget `client/src/app/shared/ui/customer-lookup/` (ts, html, scss, service with per-session cache by customer number, spec).
- New page `client/src/app/features/employee-portal/customer/` (customer-page ts/html/spec); route `clientes/:number` (employeeGuard, title "Cliente") in `employee-portal.routes.ts`.
- `employee-portal.html/.ts` (queue "Consultar cliente" and search "Selecionar" use the widget; `useCustomer(profile)` keeps the basket when the same customer is shown again; `?cliente=C-000042` opens the order form), `employee.service.ts` (`getClientByNumber`), `number.pipes.ts` (`parseCustomerNumber`), `pt-br.ts`, `_components.scss` (`.facts`), admin customers tab (number links to the page).
- Specs updated: employee-portal, admin-customers (router + link), `no-ids-on-screen.spec.ts` (customer page and open widget scanned).
- Audit: `test/layout/rules.mjs` (new `popover` rule; covered-text exempts a popover; overlap ignores a pinned sticky box only while a popover is open), `audit.mjs` and `axe.mjs` (`/employee#widget`, `/employee/clientes/C-000001`, `/C-999999`), fixtures `popover.html`, `clean-popover.html`.
- Docs: project.md (row MRV-9.2), architecture.md, coverage-map-client.md, layout-audit.md.
- No API change (the by-number profile already carries quotes and orders; open counts are computed client-side).

## Verification per AC
- AC-1/2/3/4/8: `customer-lookup.spec.ts` (role, labelledby, aria-busy, facts and "—", link href/target/rel, focus in, Escape/close/outside click with focus return, Tab trap both directions, cache with `expectNone`, retry, failure not cached, late answer ignored). By eye in the built-in browser (demo employee, dev stack): at 1280 the widget opens next to the button, focus is on the dialog, Tab cycles Fechar/link, Escape returns focus to the button, the link goes to `/employee/clientes/C-000001` (target `_blank`; the pane navigated in-tab, page loaded); at 320 the dialog sits at x 8..312, below the header, scrolls its own content, outside click closes it.
- AC-5: audit 0 incl. `/employee#widget` at 320..1920; text zoom 200% not re-run.
- AC-6/7: `customer-page.spec.ts` (success, quotes/orders numbers, back link, 404 and malformed numbers show "Cliente não encontrado" without request, 500 retry, route guarded by `employeeGuard` and titled). Guard behaviour itself is the existing matrix spec.
- AC-9: `bash /tmp/ct.sh`-equivalent client suite 1185 -> **1223 specs (+38)**, three identical runs of 1222 before the last review fix, final run 1223 green.
- Layout audit `bash test/layout/run.sh`: **0 violations over 240 loads**; fixtures **23, 0 failed**; axe `bash test/layout/axe.sh`: **0 on 34 pairs** (employee scoped re-run 10 pairs, 0).
- Bundle (gzip -9 per file, js+css, island excluded, built image): **208,471 B** (was 202,799; gate 237,975).
- Lighthouse (femtopixel): a11y 100, CLS 0 on home, storefront, contato, mobile and desktop (perf 69/98, 69/98, 71/98).

## Reviewer (1 round): ACCURATE
Fixed from findings: late answer after close no longer emits/shows (spec added); re-showing the same customer no longer empties the basket; sticky-overlap exemption scoped to pages with an open popover. Left as is: root cache has no TTL (as AC-8 asks; `forget()` unused), page reads the route snapshot (no in-page navigation between customers today), covered-text exemption covers the widget's own overlay.

## Gaps / deviations
- AC-7: the refused-visitor redirect is the shared `employeeGuard` (landing page `/`), not login/portal; the Captain may want a decision.
- Contact e-mail shows "—" (profile DTO has no e-mail); account type, CNPJ/CPF "—" until 9.3/9.4.
- The browser pane could not open a second tab; the link's `target=_blank` was verified by attribute.
- Text zoom 200% not run; runtime suite not run (no API change).

## O-4 (return): the two spec gaps closed
- **AC-7:** new `staffPageGuard` (`core/auth/role.guard.ts`) on `/employee/clientes/:number`: anonymous or expired session to `/login`, a customer to `/portal`, unknown role to `/`, Employee and Admin in. The shared `employeeGuard` is untouched (its matrix and other routes keep sending refused visitors to `/`), so the dedicated guard is the smallest coherent change. Specs: `role.guard.matrix.spec.ts` (Anonymous, Client, Expired Admin, Employee, Admin, Unknown role) and the route spec in `customer-page.spec.ts`.
- **AC-2:** `ContactEmail` (the customer's login e-mail) added to `ClientProfileDto`, filled from the Identity user in `EmployeeClientsController.ToProfileAsync`; so it appears only on `GET /api/employee/clients/{id}` and `/by-number/{n}` (Employee, Admin; customers 403, visitors 401) and in no customer-facing DTO. `ClientSummaryDto` and the admin by-number line are unchanged (not needed: widget and page use the profile). Shown in the widget and the page ("—" when null). Verified on the dev stack (read-only GET: demo customer shows its login e-mail).
- API test `CustomerNumberTests.StaffSeeTheCustomersLoginEmail...` (by id and number, customer 403, anonymous 401, own profile has no such field); runtime assertion added in `api-security.mjs`.
- Re-run: client **1229 specs, three identical runs**; API **465 pass (+1)**; runtime suite (dev stack `down` without -v, then restored with `up -d --build`) **349 pass, 0 failed**; layout audit **0 over 240 loads**; fixtures 23/0; axe **0 on 34 pairs**; bundle **208,539 B** (gate 237,975).
- Reviewer round on this delta: ACCURATE; two low doc/spec-wording notes fixed (coverage map guard name; the matrix spec's unused tuple element is harmless).
- Docs updated: project.md (row and endpoint line), architecture.md, coverage-map-client.md and coverage-map-api.md.
- The earlier "Gaps" about the guard redirect and the missing e-mail no longer apply. Dev stack is up again with the final code; dev DB untouched.

## O-5 (return): customer cache hardening (client only)
- `CustomerLookupService` now belongs to the signed-in session: it remembers the token that filled it and drops everything when the user is signed out, another user signs in (different token) or the token expires (`isAuthenticated()`); an answer that arrives after such a change is not stored (Reviewer finding). Entries live 60 s (`LOOKUP_CACHE_MS`); reopening inside that window makes no second request (AC-8), at 60 s it asks again.
- New `customer-lookup.service.spec.ts` with fake timers: reuse inside 60 s, reload at 60 s, logout clears, another user signing in sees no cached profile, token expiry inside the 60 s clears, late answer after a user switch not stored.
- Re-run: client suite alone x3 = **1235 specs**, identical; fixtures 23/0; layout audit 0 (full 240-load run before the last small edit, employee groups 64 loads re-run after: 0); axe 0 on 34 pairs; bundle (gzip -9 -n -c per file) **208,693 B** (gate 237,975). Reviewer: ACCURATE; its race finding fixed; the same-role-different-token spec case and duplicate concurrent opens left (not required).
- Docs: project.md counts updated.
