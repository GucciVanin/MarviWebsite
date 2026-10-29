# Captain log

- 2026-10-28 Worker O1 (SEO): complete (319). Reviewer: mostly accurate; real defects: `<` escape was a no-op (single backslash), route-title spec not recursive, false comment. Security: pass (low: noindex is JS-only, robots Disallow hides noindex from compliant crawlers; X-Robots-Tag header would fix; soft-404 for unknown paths). Action: return-worker.
- Worker round 1: complete (321). Captain corrected spec AC-5/6 (/client -> /portal). Action: route-verify. Testing: client x3 = 321 pass. Action: next-order.
## Follow-ups
- Add `X-Robots-Tag: noindex` in nginx for /admin /employee /portal /login /register (remember add_header in a location replaces server-level headers).
- No wildcard/404 route; unknown URLs keep the previous title and serve indexable index.html (soft 404).
- sitemap.xml needs the production domain.
