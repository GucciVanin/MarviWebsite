# Overnight run report (2026-10-28), /start-dev workflow

Branch `dev`, one PR. Seven commits after the docs scaffolding, one per story. Each story went Worker -> Reviewer -> Security -> Testing; every one needed at least one correction round (details in docs/work-items/*/captain-log.md).

| Story | Commit | What | Gates |
|---|---|---|---|
| MRV-2.7 | 23d63c3 | Privacy notice + /privacidade (draft text) | Reviewer: gaps fixed; Security pass |
| MRV-2.8a | d65aa81 | Contact API, admin list/handle, pending group, migration | Reviewer accurate; Security pass (medium noted) |
| MRV-2.8b | 264a256 | /contato page | Reviewer gap fixed; Security pass |
| MRV-2.8c | ae1f906 | Admin inbox group | Security medium (mailto injection) fixed |
| MRV-2.9 | 0c029c2 | SEO basics | Reviewer found a no-op escape, fixed |
| MRV-3.5 | c83eb84 | Coverage maps + tests | Reviewer: drift guard added |

Verified: API 448 pass (3 runs), client 1013 pass (3 runs; the count includes each `it.each` case), runtime suite 340 pass on real Postgres, production build (stack rebuilt), browser check of /contato, notice, footer, robots.txt, JSON-LD at 375 px. The admin inbox group was NOT driven in a browser (needs a login; covered by specs only) and the contact form was NOT submitted for real (would write to the dev DB).

## Needs you
1. Real phone, WhatsApp, e-mail, address, CNPJ/legal name (placeholders in `core/contact/contact-info.ts` and the privacy page).
2. Legal review of the privacy text (draft).
3. Production domain (for sitemap.xml and `og:url`).
4. Consignado/audience messaging: not started (needs your wording). Clients section, promotions: not started (need content).
5. Google Places key + Place ID (from the earlier PR).

## Decisions I took on your behalf (reversible)
- Privacy notice is informational ("Entendi"), not a consent wall, because the site sets no cookies.
- Contact messages are stored (not e-mailed) and appear in Pendências; honeypot + 5 per minute per IP rate limit.
- No sitemap.xml; login/register are noindex.
- Reviewer and Security ran in parallel for front-end-only stories (the workflow runs them in sequence).
- Missing skills: `/mattpocock-skills:implement` and its installer are not installed, so I wrote the order briefs myself (as you chose).

## Follow-ups (not fixed, no production change beyond the stories)
- Do not publish API port 8080 in production: the rate limiter trusts X-Forwarded-For (documented in operations.md).
- No retention/global cap on contact_messages; rate limit keyed per IPv6 address.
- JWT interceptor attaches the token to every URL, not only /api (harmless while all calls are relative).
- Add `X-Robots-Tag: noindex` in nginx for private paths (robots.txt Disallow hides the JS noindex from crawlers); no 404 route (soft 404s).
- Exclude `src/**/testing/**` in tsconfig.app.json.
- The notice bar is 151 px tall on a phone: consider a shorter text.
- The two Reviewer-and-Security parallel runs and the missing `implement` skill are process deviations; see learning-log.md.
