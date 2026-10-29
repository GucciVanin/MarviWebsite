# Captain log

- 2026-10-28 Workers O6 (API, 416 -> 447) and O7 (client, 321 -> 1013 counted per `it.each` case): complete, run in parallel on disjoint folders. Reviewer: accurate; soft spots: matrix allowed-role check only "not 401/403", hand-copied route list (drift). Security: pass (low: jwtInterceptor attaches token to every URL; test helper compiled in app tsconfig; info: import answers 415 before 401). Action: return-worker (API) for drift guard + no-5xx.
- Worker round 1: complete (448). Action: route-verify. Testing: see test-report. Action: next-order.
## Follow-ups (production changes deliberately not made under MRV-3.5)
- JWT interceptor: attach the token only to same-origin /api/ URLs (+ a spec with a foreign absolute URL).
- Exclude `src/**/testing/**` in client/tsconfig.app.json.
