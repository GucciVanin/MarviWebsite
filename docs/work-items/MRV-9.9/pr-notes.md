# PR notes MRV-9.9 (issue #61)

Closes #61. Carries the owner's bundle decision (total cap 300 kB).

**Behaviour changes to review**
- A Suspended customer cannot sign in: 403 `{code: account_suspended, message}` only after the right password; a wrong password is the same 401 as ever.
- An existing session ends within 60 s (immediately when an admin acts on the same API process): every request with that token, public ones included, answers 403 with the code; the SPA signs out and shows the message on /login. `/api/auth/*` exempt.
- The read-only Suspended portal and the visitor-price storefront view are no longer reachable via the API with a stale token; they stay in the SPA as defence in depth.
- Several API replicas: the others lag up to 60 s (decisions.md). Password reset, when built, must respect this.
- Bundle: total cap 300,000 B (was 237,975 B); current 236,810 B; first visit of `/` 124,300 B reported, not gated. `test/bundle-size.sh`, `test/client.sh` are new.

**Verification:** API 770 x3; client 1480 x3 (exit 0, no Errors line); runtime suite 443/0 (run; includes a 60 s real-time check); layout audit 0/368, fixtures 25/0, axe 0/66, 200% text gated categories 0, Lighthouse a11y 100 and CLS 0; browser e2e of suspend -> logout message -> approve -> sign-in.
