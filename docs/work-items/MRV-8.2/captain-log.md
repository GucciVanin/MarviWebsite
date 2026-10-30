# captain log

## 2026-10-29 Worker report: blocked only on Reviewer round 2 verdict
Public groups 166/195/130 -> 0/0/0; whole run 1023 -> 314 (remainder is portals); Lighthouse a11y 100, CLS 0; tests 1135; bundle 198,466 B (pre-tweak measure). Reviewer round 1: changes requested, fixed.
Decisions accepted by Captain (reversible, owner may veto at PR): brand lockup (badge + stacked name/tagline) judged per text run via `data-lockup`; header collapses to the menu at 80em so 1024-1279 px uses the menu button; tagline moves into the open menu panel; contact cards equal height; `.btn--wrap` only below 640 px for the closing-banner CTA.
Gap: 200% text zoom still overflows at 375 px on contact (send button min width), storefront cards and hero headline; WhatsApp button never rendered (placeholder number) so unverified.
Action: **return-worker** — fix the 200% overflows (fluid min-widths), get Reviewer round 2 verdict and re-measure bundle and tests x1 after final CSS.

## 2026-10-29 Worker report (second): complete, Reviewer round 2 APPROVED
Same figures as the first report plus the round 2 verdict. It does not contain the 200%-zoom overflow fixes ordered above (the Worker was resumed with that order; this report crossed it). Reviewer optional notes (`.btn--wrap` nowrap from 40em, `overscroll-behavior: contain` on the menu panel) accepted as small hardening items.
Action: **return-worker** — outstanding order stands: 200%-zoom overflow fixes, then a final re-run (public audit, fixtures, client tests, bundle). Not routed to Security until that report arrives.

## 2026-10-29 Worker report (third, identical to the second)
Re-delivery of the same hand-back; still no 200%-zoom fixes in it. Action: **return-worker** — no new order; the standing order stands and the Worker's next report is awaited.

## 2026-10-29 Worker report (fourth): 200%-text pass done, Reviewer round 3 verdict missing
Public groups 0 at normal size; whole run 305 (portals only); `--text-zoom 2` public overflow 0 (67 wrapped-control and 6 covered-text remain, reported not gated: notice taller than half the screen at 320 px/200%); fixtures 18/0; tests 1135; bundle 198,839 B; Lighthouse a11y 100, CLS 0. The 200%-text delta is unreviewed.
Action: **return-worker** — Captain spawns a fresh Reviewer (round 3, last allowed) over the final tree; Security and Testing follow only on `accurate`.

## 2026-10-29 Worker report (fifth): complete, Reviewer round 3 APPROVED (Worker-resumed reviewer)
Doc fixes applied. Known issue for owner: notice taller than half the screen at 200% text on 320 px. Captain's own fresh round-3 Reviewer is still running as an independent second look; a blocker from it would reopen the item.
Action: **route-security** (in parallel with the independent review).

## 2026-10-29 Security report: pass (info only)
No CSP, binding, auth-UI or credential findings. Info: `--text-zoom` only parsed as first argument of run.sh; `TEXT_ZOOM` unvalidated (operator-controlled, harmless).
Action: **route-verify** — Testing x3 (client suite, fixtures, full audit, text-zoom run), build and bundle, Lighthouse once.

## 2026-10-29 Captain's independent Reviewer: not accurate, no blockers (3 should-fix, 4 nit)
1 `.btn` is now nowrap at every width in the portals (HEAD had no white-space); 2 stale "nowrap from 40em" claims in architecture.md, project.md, decisions.md; 3 layout-audit.md "After MRV-8.2" inconsistent (314 vs 305, reversed wrapped-control claim, by-rule counts from the 314 run); 4 comment detached; 5 no fixture for `.btn--wrap` at >=640 px; 6 icon cap shrinks `.btn--lg` icon below ~345 px; 7 portal `.field` height (known, 8.3-8.5).
Captain decision: the portal nowrap stays (it removes wrapped controls; slices 8.4/8.5 own portal verification, and the audit's portal overflow counts did not rise) but is stated plainly as a portal change. Docs-only fixes plus nit 4 and fixture 5; no code behaviour change, so Testing continues in parallel.
Action: **return-worker** — fix items 2, 3, 1 (state), 4, 5, 6 (note), with no further review round (Worker already had three; Captain checks the diff).

## 2026-10-29 Worker report (sixth): Reviewer fixes applied
Docs consistent (305 run), comment moved, new fixture (19/0), portal nowrap stated plainly. Captain checked the 40em claims by grep.
Action: **next-order** — wait for Testing's report; its fixture expectation (18) predates the new fixture, so fixtures are re-run x3 after it reports; then commit.

## 2026-10-29 Testing report: pass
Client 65 files / 1135 specs x3; full audit x3 identical (md5 66ca4dd2), 305 violations, public groups 0; `--text-zoom 2` public: 73 (67 wrapped-control, 6 covered-text), no overflow; fixtures 18 at Testing time, re-run by Captain x3 after the added fixture: 19/0. Bundle by Testing's method 199,714 B (+21,739 B vs 177,975 B; gate 60 kB), Worker's figure 198,839 B differs by 875 B (method); home.scss 75 B over its 8 kB budget (warning).
Action: **close-item** for the slice (commit, push). Follow-ups: trim home.scss under its budget; the 875 B measurement discrepancy; notice height at 200%/320 px; `.btn--wrap` nowrap from 40em hardening; `overscroll-behavior: contain` on the menu panel.
