# MRV-9.9 Suspended customers cannot sign in

**Goal.** A customer whose account is Suspended cannot log in or keep using an existing session until the company resolves the matter internally and reinstates them.

**Owner input (2026-11-03).** "Customers with account suspended shouldn't even be able to login in their account until we solve it internally."

**Evidence (Captain, code read).** Login (`AuthController`) does not look at `ClientAccountStatus`; a Suspended customer signs in and sees a read-only portal (and, since MRV-9.4, a read-only registration form). The statuses are Pending, Approved and Suspended.

**Decisions (Captain, reversible).**
- Login refuses a Suspended customer with **403** and a pt-BR message ("Sua conta está suspensa. Entre em contato com a empresa."). The message is given **only after the password is verified**, so it cannot be used to discover which e-mails are suspended; a wrong password still answers the same generic failure as today.
- Existing sessions end: a Suspended customer's valid token stops working within at most 60 seconds (status is checked server-side for the Client role on authenticated requests through a short-lived cache that an admin status change invalidates), and the SPA signs the person out and shows the same message on that answer.
- Pending customers keep signing in as today (they fill in their registration data and wait for approval). Employees and Admins are unaffected.
- Reinstating a customer ("Aprovar") restores sign-in immediately. No password-reset flow exists yet; when one is built it must respect this.
- Nothing is deleted: orders, quotes and data of a suspended customer stay; staff still see and open them through the customer page.

## Acceptance criteria
- AC-1 `POST /api/auth/login` for a Suspended client with the **correct** password answers 403 with the message and no token; with a wrong password it answers exactly what any wrong-password login answers (same status, body shape and timing class); an unknown e-mail is unchanged. A test proves the wrong-password case is indistinguishable from a normal failure.
- AC-2 A token issued before the suspension is rejected (401 or 403 with a machine-readable reason) on every request carrying that token (public endpoints included; `/api/auth/*` exempt) within 60 s of the admin suspending the account (immediately when the same process handles both, via cache invalidation); tests with a fake clock; Approved and Pending tokens unaffected; Employee and Admin tokens unaffected.
- AC-3 The SPA shows the suspension message on the login page after a 403 and, for an already signed-in customer who gets the suspension answer, clears the session and redirects to login with the message (no raw error); a spec for each.
- AC-4 Admin "Suspender" invalidates the status cache at once; "Aprovar" restores access; both audited as today; the admin customers tab and the lookup widget and page keep showing suspended customers.
- AC-5 Quotes, orders, addresses and registration endpoints for a Suspended customer are unreachable through the API even with a stale token (covered by the authorization matrix test), so the read-only Suspended UI paths (MRV-9.4) become defence in depth and stay in place.
- AC-6 The auth rate limit is unchanged; the 403 consumes no more than a normal failed login; nothing new is logged beyond the existing audit.
- AC-7 Runtime suite on Postgres: suspend, login refused, approve, login works, with throwaway data; API and client suites and the authorization matrix updated; layout audit and axe cover the login message; three identical runs with exit code 0 and no "Errors" line from the client suite.
- AC-8 `CONTEXT.md` (**Suspension** now means no sign-in), `project.md`, `architecture.md`, coverage maps updated; behaviour change listed in `docs/work-items/MRV-9.9/pr-notes.md`.

## Out of scope
A suspension reason shown to the customer, scheduled or automatic suspension, e-mail notification, password reset, suspending employees.

## Open questions
None.
