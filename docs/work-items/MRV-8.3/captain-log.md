# captain log

## 2026-10-29 Worker report: blocked only on Reviewer round 2 verdict
Whole run 305 -> 235; form-column-width 46 -> 0; form-row, form-left-edge, card-height 0 everywhere; public groups 0; fixtures 19/0; specs 1135; bundle 198,878 B (Worker method); Lighthouse a11y 100, CLS 0. Reviewer round 1 changes (docs, duplicate rule, empty status paragraph) fixed; round 2 verdict missing.
Captain decision (reversible, owner may veto at PR): accept extending `.toolbar`/`.field` instead of a new `.form-grid`/`.form-actions` system and defer a `.form-actions` wrapper to 8.4/8.5 (no measured defect; ~20 templates).
Action: **return-worker** — Captain resumes the Reviewer (a3765d8fe0308cf80) for the round 2 verdict directly; Security and Testing only on `accurate`.

## 2026-10-29 Worker report (second): complete, Reviewer round 2 APPROVED
235 violations, form rules 0, public 0, fixtures 19/0. Non-blocking: `p:empty` repeats `.visually-hidden` declarations. My direct Reviewer request may still return; a blocker would reopen.
Action: **route-security** (CSS-only change; Testing runs in parallel).

## 2026-10-29 Reviewer round 2 (direct): not accurate, docs only, no blocker
Round-1 findings fixed. New: project.md MRV-8.3 row and decisions.md line 15 still overstate "all/every form uses `.toolbar > .field`" (profile, login, register, contact do not); nit: row should say editors opened by click were not audited; nit: `p:empty` duplicates `.visually-hidden`. Reviewer: after items 1-2 are reworded, APPROVED. Deferral of `.form-grid`/`.form-actions` acceptable.
Action: **return-worker** — reword the two claims and add the not-audited note (docs only); Security and Testing continue in parallel; Captain checks the diff, no further review round.

## 2026-10-29 Security report: pass (info only)
Only `_components.scss` changed in code; no CSP, hidden-message or consent-control risk (`:empty` paragraph stays in the a11y tree, checkbox rules keep controls visible). Info: assumes `.field` is `position: relative`; `:has()` fallback harmless.
Action: **route-verify** (Testing already running).

## 2026-10-29 Worker report: docs corrections done, nit skipped
Captain verified the reworded lines by grep. `p:empty` reuse of `.visually-hidden` stays a follow-up (class, not a mixin).
Action: **next-order** — wait for Testing's report, then commit.

## 2026-10-29 Testing report: pass
Client 65 files / 1135 x3; fixtures 19/0 x3; full audit x3 identical (md5 3db2bf27), 235 violations, form rules 0, public/pending/suspended 0; text-zoom (all groups, 320/375): 221, public 67 wrapped-control + 6 covered-text, portals overflow 8.4/8.5; bundle 198,888 B (gzip CLI) / 199,530 B (node zlib), +20.9/+21.6 kB vs 177,975 B, gate 60 kB; home.scss 75 B over its budget (warning, unchanged). The 8.2 figure 199,714 B does not reproduce with either method (method undocumented); from now on the method is gzip CLI per file.
Action: **close-item** for the slice. Follow-ups: document the bundle measuring command in docs/tests; trim home.scss; `p:empty` reuse of `.visually-hidden`.
