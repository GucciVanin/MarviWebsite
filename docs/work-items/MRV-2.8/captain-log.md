# Captain log

## 2.8a (O1)
- 2026-10-28 Worker O1 (API): complete (API 414, runtime 340 on real Postgres, dev stack restored). Action: relay to Reviewer.
- Reviewer: accurate; note: whitespace-only honeypot passed as empty. Action: route-security.
- Security: pass. Medium (existing deployment): API 8080 is published by dev compose and the limiter trusts X-Forwarded-For, so a direct caller can dodge limits (documented in operations.md, compose unchanged; fix in production by not publishing 8080). Low: no body cap (fixed), no retention/global cap on contact_messages (follow-up), per-IPv6 address keying (follow-up). Action: return-worker for honeypot, size limit, docs.
- Worker round 1: complete (API 416). Size-limit test cannot distinguish 413 from 400 on TestServer. Action: route-verify.
- Testing: API 416 x3 pass; runtime 340 pass (run once, before the small fixes, which the runtime checks do not exercise). Action: next-order.
## 2.8b (O2)
- Worker O2 (contact page): complete (292). Reviewer and Security ran in parallel (Captain deviation, front-end only, recorded). Reviewer: accurate, gap: no focus management, no boundary specs, dangling aria-describedby. Security: pass (low: server detail shown in alert; honeypot autofill residual). Action: return-worker.
- Worker round 1: complete (299). Action: route-verify. Testing: client x3 = 299 pass. Not verified in a real browser. Action: next-order.
