# captain log

## 2026-10-30 Worker report: complete, Reviewer accurate round 1 (with a finding)
API 464 (+16), client 1183 x3, runtime 348/0, migration-numbering 8/8, axe 0 on 28, fixtures 19/0, bundle 202,437 B. Layout audit NOT 0: 2 `form-left-edge` on /employee at 320 px, caused by a second Submitted two-line quote in the dev DB (not created by the Worker); same result with the old header, so a latent defect the audit exposes (the queue's price form with two lines), not a regression and not to be waved away by wiping data. Behaviour change: category links use the category name in the query string.
Action: **return-worker** (fix the queue form-left-edge defect with the data as it is; rerun audit to 0) and **route-security** in parallel on the current change set (the fix is layout-only).

## 2026-10-30 Security report: pass (1 low)
No high/critical. Endpoints authorised like the by-id routes; digits-only parsing; migration backfill safe with Down; no IDOR; storefront category query safe. Low: bind migration-numbering.sh's port to 127.0.0.1 (applied by the Worker with the O-5 fix; recorded as follow-up if not).
Action: **route-verify** once the Worker's O-5 fix lands (Testing runs on the final change set, so waiting for it).

## 2026-10-30 Worker report O-5: complete
Queue price inputs had no form, so one- and two-line quotes shared a group and misaligned by ~22 px: each quote's table and send button now sit in their own form (Enter sends). Audit 0/216, fixtures 21/0 (two new), axe 0/28, client 1185 x3, bundle 202,799 B. Reviewer nits done (audit label in admin overview, stale-category guard). No independent Reviewer round on O-5 beyond Testing's check (small template change; Reviewer round 1 on O-1..O-4 was accurate).
Action: **route-verify** (Testing, three runs, final change set).

## 2026-10-30 Testing report: all pass
API 464 x3, client 1185 x3, fixtures 21/0 x3, audit 0/216 x3 (+1), axe 28/0 x3, bundle 202,799 B x3, migration-numbering 8/8, runtime 348/0, GUID scan of /employee, /employee/historico, / clean. Option `value` attributes carry category GUIDs on /storefront and /portal: allowed by spec AC-4 (values of option/input), noted.
Action: **close-item** (commit; owner reviews the PR for the whole epic).
