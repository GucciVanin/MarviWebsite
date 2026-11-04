# Worker report MRV-9.9 (issue #61)

**Verdict: complete.** Nothing committed or pushed. Admin password never printed. Dev stack restored (`up -d --build`: api healthy, client and postgres up; it was exited when I started); the dev DB was not touched (no `down -v`, no writes).

## Files
- API: `Identity/ClientStatusCache.cs` (cache + `AccountSuspension` body), `Identity/SuspendedClientGate.cs` (middleware), `AuthController.Login`, `AdminClientsController` (Suspend/Approve invalidate), `IdentityModule` (registrations, `UseSuspendedClientGate`), `Program.cs` (after `UseAuthentication`).
- SPA: `api-error.ts` (`isSuspendedAnswer`), `auth.service.ts` (`endSuspendedSession`, `takeSuspendedNotice`), `jwt.interceptor.ts`, `login.ts`, `pt-br.ts`, specs.
- Tests: new `SuspendedCustomerTests`; `AuthorizationMatrixTests` (stale-token row sweep); `TestClients.SetClientStatusAsync` invalidates; five existing tests rewritten to the new rule; runtime section "SUSPENDED CUSTOMERS CANNOT SIGN IN" (+ one SQL reinstate replaced by the API approve); `test/layout/audit.mjs` and `axe.mjs` (`/login#suspended`, suspended portal group removed).
- Tooling: `test/bundle-size.sh` (new), `test/client.sh` (new, keeps the exit code).
- Docs: CONTEXT.md (Suspension), project.md (row + NFR bundle row), architecture.md, coverage maps, docs/tests/README.md (bundle section, runtime note, client command), layout-audit.md, seed-demo comment, decisions.md, pr-notes.md.

## O-0 Bundle
Old gate 237,975 B (nothing in scripts or CI enforced it; it lived in work-item orders and the specs); new cap **300,000 B**, now stated in docs/tests/README.md and project.md section 5 and enforced by `bash test/bundle-size.sh` (exit 1 above). Measured on the built image: **236,810 B total** in 57 files (`gzip -9 -n -c` per file, island excluded; headroom 63,190 B; 1,165 B under the old cap). **First visit of `/` (reported, not gated): 124,300 B** in 4 files (main 58,222, chunks 53,266 and 6,984, styles 5,828).

## Per AC
- AC-1: `SuspendedCustomerTests` (403 + code + message, no token; wrong password of a suspended customer identical to a Pending customer's and an unknown e-mail's: status, body minus traceId, header names). Runtime on Postgres too. Timing class: same work by construction (password check precedes any status read); not measured.
- AC-2: fake clock (`ClockedFactory`): after a change behind the API's back, 59 s accepted, 60 s refused, both directions; admin Suspend/Approve act at once; Approved, Pending, Employee, Admin tokens unaffected. Runtime: status changed with SQL noticed after 60 s of real time.
- AC-3: SPA specs: login 403 message (not "verifique seu e-mail"), once after an ended session, other 403 not a suspension, interceptor ends the session, skips the login request; browser e2e on the throwaway stack: signed-in customer suspended -> reload -> /login with the message, token cleared; sign-in 403; approve; sign-in works.
- AC-4: tests above; audit entries (one Suspend, two Approve) asserted; customers tab and lookup unchanged (staff endpoints untouched).
- AC-5: matrix sweep: every row of `Endpoints()` answers 403 `account_suspended` with a stale token; `/api/products` too.
- AC-6: `TheSuspendedAnswer_UsesTheSameSignInBudgetAsAWrongPassword` (3 per minute then 429); no new logging.
- AC-7: runtime section; layout audit; axe; three client runs.
- AC-8: docs listed above.

## Numbers
- API `dotnet test test/Marvi.Tests`: **770** (was 760) x3 identical, exit 0.
- Client `bash test/client.sh`: **1480** (was 1474), 80 files, x3, `NG_EXIT=0`, no Errors line.
- Runtime suite (dev stack `down` without -v, restored after): **443** passed, 0 failed (was 429) x4 (3 before the last cache tweak, 1 after).
- Throwaway `marvi-audit` stack (seeded by seed-demo, removed with its own `down -v`): layout audit **0 over 368 loads**, exit 0, nothing skipped; fixtures 25/0; axe **0 on 66 pairs** (login message included at 375 and 1280); text zoom 2: 320 -> wrapped-control 152, covered-text 2; 375 -> 105 and 3; no gated category; Lighthouse `/`, `/login`, `/contato` mobile and desktop: accessibility 100, CLS 0 (performance 68-72 mobile, 98 desktop, not gated).

## Reviewer
One round: ACCURATE. Low finding fixed: the generation re-check after the cache write (closes a microsecond race for "at once"). Accepted/noted: no deterministic test for the in-flight race or the 10,000-entry bound (decisions.md says so); comparison variable renamed (it is a Pending account); global generation counter is coarse but harmless.

## Deviations / gaps
- The gate applies to every request carrying the token, public endpoints included (spec said "every client endpoint"; stricter, same code). `/api/auth/*` exempt.
- Existing tests asserting the read-only Suspended behaviour through a stale token were rewritten (403 now).
- Multi-replica lag up to 60 s (decisions.md). Unknown-e-mail vs known-wrong-password timing difference pre-exists.
- `docs/tests/README.md` now points to `test/client.sh` instead of `/tmp/ct.sh`.

## O-4 (Captain order after Reviewer accurate, Security pass)
1. Spec AC-2 reworded to "every request carrying that token (public endpoints included; `/api/auth/*` exempt)".
2. Defence-in-depth tests (API): `InsideTheStaleWindow_TheProfileControllersOwnSuspendedRule_StillRefuses_AndAfterItTheGateDoes` and `InsideTheStaleWindow_TheQuoteRules_StillRefuseASuspendedCustomer_WithTheirOwnMessage` (fake clock: cache stale-Approved, DB Suspended; inner branches refuse, then the gate after 60 s).
3. SPA spec: a stale token on a public call (`/api/products`) ends the session once, redirects once to /login, note shown, next request sends no token (no loop).
4. Fail closed (decided and documented in decisions.md): a throwing status lookup gives 500, never passes, caches nothing; two deterministic tests. `ClientStatusCache` unsealed / `GetStatusAsync` virtual for the test double. Timing follow-up and cache eviction untouched.
Re-run results below.
O-4 re-run: API **774** (was 770) x3 identical, exit 0; client `bash test/client.sh` **1481** (was 1480) x3, `NG_EXIT=0`, no Errors line; fixtures 25/0. No template changed, so audit/axe/runtime were not re-run (the only API source change is unsealing `ClientStatusCache` and making `GetStatusAsync` virtual). Nothing committed.
