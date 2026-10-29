# MRV-3.5 Raise test coverage — issue #39

**Goal.** Every controller and every front-end service and guard has a test that fails if its contract breaks. Runs last, so it covers the new MRV-2.7/2.8/2.9 code too.

## Acceptance criteria
- AC-1 `docs/tests/coverage-map.md` lists every API controller with its endpoints and the test that covers success, an auth failure (401/403 where it applies) and a validation failure (where it applies); gaps are filled.
- AC-2 Every endpoint in section 7 of `project.md` marked ✔ has at least one HTTP-level test.
- AC-3 `docs/tests/coverage-map.md` also lists every Angular service, guard and interceptor with its spec; each has a spec for success and failure (HTTP error) paths.
- AC-4 No production behaviour changes. A bug found is **not** fixed silently: it is logged in `docs/work-items/MRV-3.5/decisions.md` with a failing-test reference and, if small and obviously correct, fixed in its own commit named after the story.
- AC-5 The API test suite and client suite pass three times in a row unchanged (determinism).

## Out of scope
Coverage percentage thresholds in CI, browser (Chrome UI) tests in CI, mutation testing.
