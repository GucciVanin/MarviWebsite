# captain log

## 2026-10-30 Worker report: complete, Reviewer accurate round 1; two spec gaps
Client 1223, audit 0/240 (new popover rule, fixtures 23/0), axe 0/34, bundle 208,471 B, Lighthouse a11y 100 / CLS 0. Gaps against the spec: AC-7 (refused visitors go to `/` instead of login for anonymous / own portal for a customer) and AC-2 (contact e-mail shows "—" because the staff profile DTO has no e-mail). Cache without expiry accepted (AC-8 asks session reuse; staleness noted as a known gap).
Action: **return-worker** (close AC-7 and AC-2 as written; the e-mail is an API change so Security follows the fix).

## 2026-10-30 Worker report O-4: complete, Reviewer accurate
AC-7 closed with a dedicated `staffPageGuard` (anonymous -> /login, customer -> /portal, unknown -> /); AC-2 closed: `ContactEmail` on the staff client profile only. Client 1229 x3, API 465, runtime 349/0, audit 0/240, fixtures 23/0, axe 0/34, bundle 208,539 B.
Action: **route-security** (new staff-only PII field and a new guard) with Testing in parallel (Security is read-only).

## 2026-10-30 Security report: pass (2 low, 1 info)
No high/critical. Low: the lookup cache is not cleared on logout (another staff user signing in without reload would see cached profiles incl. e-mail; no privilege gain); the cache never expires (stale status). Info: e-mail visible to all staff roles (intended: both roles already see the whole customer list).
Action: **return-worker** after Testing finishes (to avoid editing under a running test): clear the cache on logout/token change and add a short expiry; then a client-only re-run.

## 2026-10-30 Testing report: all pass
API 465 x3, client 1229 x3, fixtures 23/0 x3, audit 0/240 x3, axe 0/34 x3, bundle 208,539 B x3 (method: `gzip -9 -n -c`), runtime 349/0, Lighthouse a11y 100 / CLS 0 on 18 runs; widget and page checked on the dev stack (read-only). Q-000004 and P-000003 in the dev DB were created by the owner, not by tests.
Action: **return-worker** for the two low Security findings (cache clear on logout, short expiry), then client-only re-run before commit.

## 2026-10-30 Worker report O-5: complete, Reviewer accurate
Lookup cache scoped to the session (cleared on logout, user switch, token expiry; late answers dropped) with a 60 s lifetime; client 1235 x3, fixtures 23/0, axe 0/34, bundle 208,693 B. Captain re-ran the full layout audit on the final code: 0 violations / 240 loads, nothing skipped.
Action: **close-item** (commit; the epic PR is reviewed by the owner).
