# captain log

## 2026-10-29 Worker report: complete, Reviewer APPROVE round 1
employee 36, client 24, wholesale 18 -> 0; whole run 78 -> 0 over 216 loads; text-zoom: 0 overflow, 122 reported (wrapped-control 116, covered-text 6); axe 0 on 28 route/width pairs; specs 1140; bundle 199,932 B; Lighthouse a11y 100, CLS 0. New committed tooling test/layout/axe.mjs + axe.sh (reads admin password from env/deploy/.env). Reviewer nits (indent, no epic row, axe admin dependency, evidence file) accepted as cosmetic.
Action: **route-security** (new tooling handles credentials; focus there); Testing in parallel.

## 2026-10-29 Security report: pass (2 low, 2 info)
Credentials, token handling, bypassCSP confinement, Docker flags, pins, outbound calls and client delta all clean; one `.visually-hidden` definition remains. Low: `BASE_URL` is overridable (would send the admin password to a non-local host with CSP bypassed): refuse non-local hosts in run.sh/axe.sh; `npm install` at run time without a lockfile. Both logged as follow-ups with the 8.1 Docker-pinning finding (operator-controlled, dev only; not blocking).
Action: **route-verify** (Testing in progress).

## 2026-10-29 Testing report: all 7 pass
Client 65 / 1140 x3 (a first concurrent batch gave 1136, discarded: run alone); fixtures 19/0 x3; audit x3: 0 violations over 216 loads, exit 0, nothing skipped; axe x3: 28 pairs, 0 violations; text-zoom (320/375, all groups): 122, no overflow; bundle 199,932 B (gate 237,975 B), home.scss 75 B over budget (pre-existing warning); Lighthouse a11y 100, CLS 0 on home, storefront, contact.
Action: **close-item** for the slice and the epic MRV-8 (owner reviews at the PR). Follow-ups: BASE_URL guard and npm lockfile/digest pin for test/layout; unit assertions on the other wrappers; duplicated group/section names; keyboard scroll and focus ring by eye; admin Lighthouse; trim home.scss; notice height at 200%/320 px; `.form-actions`; card reflow vs sideways scroll.
