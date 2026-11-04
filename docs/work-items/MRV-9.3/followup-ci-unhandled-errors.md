# Follow-up: CI "Client tests and build" failing on unhandled errors (PR #58)

## Symptom
Vitest summary: `Test Files 80 passed, Tests 1474 passed, Errors 2 errors`, process exit code 1. Earlier reports compared only pass counts and called the errors "pre-existing at baseline"; an exit code of 1 is a failure.

## Root cause
A test-fixture bug, not a code bug. In `admin-customers.spec.ts`, two tests (the focus-on-open one and "puts focus on the addresses heading ... when the reload after a fix fails", added in MRV-9.3 O-6) answered `GET /api/employee/clients/c1` with a profile that has no `registration` (`{ id, ...twoAddresses(), quotes, orders }`). `AdminCustomers.loadAddresses` (admin-customers.ts, the success callback) reads `profile.registration.accountType` after `registration.load(...)`, so it threw a TypeError inside the rxjs subscriber (`core/http/action.ts` `next`). rxjs reports a throw in a subscriber asynchronously (reportUnhandledError), after the test had moved on, so the test passed and Vitest attributed the 2 errors (one per test) to the file and to the latest test.

The real API always returns `registration` (the `ClientProfile` contract, and the sibling tests at the same spec already flush it), so users cannot hit this; no production change was needed.

## Fix
`client/src/app/features/admin-portal/customers/admin-customers.spec.ts`: the two initial profile responses now carry `companyName` and `registration: registration()`, like the other tests. No suppression of Vitest's reporting. Other specs were grepped (every flush of `/api/employee/clients/...` and `getClient` users): no other incomplete profile payload; the 2 errors were the only ones.

## Verification (Docker node:24, run alone, exit code of `ng test` captured, `Errors` line grepped)
- Before (fix reverted): `Test Files 80 passed, Tests 1474 passed, Errors 2 errors`, EXIT=1.
- After, three runs: `Test Files 80 passed (80)`, `Tests 1474 passed (1474)`, no `Errors` line (grep count 0), EXIT=0 each time.
- Templates untouched, so the layout audit and axe were not rerun.

## Process note
`/tmp/ct.sh` pipes through `tail -40`, which hides the exit code; docs/tests/README.md now says the suite is green only with exit 0 and no `Errors` line.
