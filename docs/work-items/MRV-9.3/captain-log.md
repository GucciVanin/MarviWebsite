# captain log

## 2026-10-30 Worker report: complete, Reviewer round 1 NOT accurate (fixed), round 2 verdict not delivered
API 517, client 1290, runtime 357/0, migration-addresses 15/15 (+ numbering 8/8), audit 0/264, fixtures 24/0, axe 0/40, bundle 216,766 B. Deviation: spec's single IsDefault is two flags (IsBilling + IsDefault delivery) with filtered unique indexes (accepted: required by AC-4 semantics). Gaps: registration not audited, deleted-address audit lacks customer number, focus management on form open/close, create-race on 20-limit/duplicates, no Lighthouse, no 200% text.
Action: **route-security** plus an independent Captain-side Reviewer (the Worker's round-2 verdict never reached us; a report ends with a verdict, so we collect our own), both read-only and in parallel; gaps handled by return-worker afterwards.

## 2026-10-30 Reviewer report (Captain-side, static): accurate
AC-1..AC-9 met. Low: L-1 CEP accepts only `^\d{5}-?\d{3}$` (spec says strip "-" and spaces; "01001 000" refused, asserted by a test) - stricter than spec, undeclared; L-2 the 20-address limit answers 400 not 409 (spec silent; report grouped it with 409). Risks: migrated customer with empty billing text has no billing row (billingAddressKey null: 9.6 must tolerate it); create race on 20-limit/duplicates has no unique index; admin PUT ignores a false flag.
Action: Security still pending; **return-worker** after it reports (one batch: L-1 strip spaces, L-2 wording, focus management, deleted-address audit names customer number, create-race on the limit/duplicates if a cheap guard exists, and document the null-billing case in the 9.6 notes).

## 2026-10-30 Security report: pass (4 low, 2 info)
No critical/high/medium. Authorisation by owner claim and key+owner lookup (foreign key = same 404), shared validation, audit holds no street/CEP, migration safe, script bound to 127.0.0.1. Low: create race on the 20 limit / duplicates (lock the client row in the transaction or unique index); update/delete read outside the transaction (catch DbUpdateConcurrencyException -> 409); no rate limit on address writes (optional); admin 404 on unknown id (fine). Info: free text must be escaped in future PDF/e-mail/CSV outputs (9.6+).
Action: **return-worker** (one batch with the Reviewer's items), then route-verify.

## 2026-10-30 Worker report O-5: complete (Reviewer round 3 not delivered)
All 8 items fixed with tests: CEP spaces stripped, 21st address 409, row lock (SELECT FOR UPDATE) on create/update/delete with Postgres parallel tests (30 parallel creates: 19x201, 11x409, 20 rows), 409 instead of 500, CustomerNumber on every address audit entry, focus management, `addresses` rate-limit policy, null-billing note in 9.6 spec. API 522 x3, client 1294 x3, runtime 362/0, migrations 15/15 and 8/8, audit 0/264, fixtures 24/0, axe 0/40, bundle 217,319 B. One harness change to scrutinise: `test/layout/audit.mjs` now resets a table's horizontal scroll after opening a step, because focus moving into the form scrolled the table sideways and tripped `container-edge` at 320/375 on /admin/clientes#address-fix (UI unchanged).
Action: **route-security** and an independent delta Reviewer in parallel (read-only), the Reviewer to rule specifically on whether the audit.mjs scroll reset hides a real defect.

## 2026-10-30 Security report O-5: pass
No critical/high/medium. Row lock parameterised, per-customer, fixed lock order, no slow work under it; `addresses` limit per IP like the other policies, test/compose overrides not in production config; audit fallback server-written and parsed safely; 409 messages fixed strings. Low/info: no explicit lock_timeout; per-IP partition shares budget behind NAT (as existing policies).
Action: **route-verify** after the delta Reviewer verdict (pending, including the audit.mjs scroll-reset question).

## 2026-10-30 Reviewer report O-5 (Captain-side): accurate for the 8 items; 4 fixes requested
The audit.mjs scroll reset is a measurement artefact (container-edge has no scroll-container exemption, exceeds-parent has one), nothing hidden (overflow-page/element and exceeds-parent still 0; fixtures unaffected), but it patches the harness not the rule, hard-codes `.table-wrap` and is undocumented. Fixes: (1) document the `addresses` policy in project.md/architecture.md; (2) test the admin PUT limit or state attribute-only; (3) make container-edge scroll-aware in rules.mjs (skip children of a scroll container / use scrollLeft), add a clean fixture with a scrolled `.table-wrap`, keep container-edge.html flagged, drop the reset from audit.mjs, document; (4) `FOR NO KEY UPDATE` instead of `FOR UPDATE` (FOR UPDATE blocks the FK checks of quote/order inserts during an address write). No deadlock found.
Action: **return-worker** (O-6: the four fixes plus the two cheap focus fallbacks from the Worker's own Reviewer), then Testing.

## 2026-10-30 Worker report O-6: complete
Docs for the `addresses` policy, admin PUT limit test, scroll-aware container-edge rule (reset removed, new clean-scrolled-table fixture, container-edge.html still flagged), FOR NO KEY UPDATE, two focus fallbacks. API 523 x3, client 1296 x3, runtime 362/0, migrations 15/15 + 8/8, audit 0/264, fixtures 25/0, axe 0/40, bundle 217,338 B. No new Security pass: the delta is a weaker lock mode, a measurement rule and focus fallbacks, all within what Security already cleared (O-5 report).
Action: **route-verify** (Testing, three runs, incl. Lighthouse and 200% text zoom which the Worker skipped).

## 2026-10-30 Testing report: all gated suites pass; one ungated finding
API 523 x3, client 1296 x3, fixtures 25/0, audit 0/264, axe 0/40, bundle 217,338 B, migrations 15/15 + 8/8, runtime 362/0 (address races identical), Lighthouse a11y 100 / CLS 0 on 18 runs. Dev stack: migrated legacy addresses show "Complete este endereço", no GUID. Note: the testing report says "2 rows" after 30 parallel creates; the runtime assertion (and the Worker/Reviewer) say 20 - treated as a typo in the report, the assertion is the evidence.
200% text zoom (320/375, ungated): 212 findings vs 122 at 8.5; unlike 8.5 (0 overflow) there are 4 overflow-page (employee customer page /employee/clientes/C-000001 and C-999999 - from 9.2) and 36 exceeds-parent (24 lookup widget facts rows from 9.2; 12 "Complete este endereço" badge 9.2 px wider than its card, from 9.3), plus wrapped buttons in the new forms (by design at 200%, as in 8.x).
Action: **close-item** for 9.3 (commit), then **return-worker** as a follow-up commit naming 9.2/9.3 to restore the 8.5 standard of 0 overflow at 200% text.
