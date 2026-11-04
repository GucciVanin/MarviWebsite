# captain log

## 2026-11-03 Worker report: complete (O-0, O-1)
Single `ProductRules`; legacy POST removed; PUT whole-product with IsActive-only exception; import per-row verdicts (all-or-nothing kept, accepted deviation); data check; category required on every path (Captain ruling, O-1). API 844, client 1546 (exit 0, no Errors), runtime 458/0, audit 0/368, axe 0/66, bundle 236,945 B. Reviewer accurate (two rounds).
Action: **route-security**, in parallel **route-verify** (code frozen while Testing runs).

## 2026-11-03 Security report: pass (no critical/high)
Follow-ups (not blocking, admin-only surface): S-1 import column-count cap and quadratic attribute merge; S-2 problem lists grow before caps apply (30 MB body), add RequestSizeLimit/cap; S-3 import messages echo raw cell values and audit FileName unsanitised; S-4 no rate limit on PUT/import/data-check, whole table loaded; S-5 concurrent edit overwrite (concurrency token); S-6 IsActive-only exception also allows reactivating a rule-breaking product (consider validating on reactivation). Info: any https image host harmless; neutralise formula prefixes if CSV export is ever added.
Action: **route-verify** (continue Testing); S-1..S-6 logged as follow-ups for the owner's PR list. S-6 is the one to decide on.

## 2026-11-03 Testing report: pass
Three identical runs: API 844, client 1546 (exit 0, no Errors), fixtures 25/0, audit 0/368, axe 0/66, bundle 236,945 B of 300,000 B, runtime 458/0 x3 (two informational status lists in race checks vary; assertion "no 500" passed each time), Lighthouse a11y 100 / CLS 0, 200% gated 0. Browser walk of the product panel on a throwaway stack passed. Dev stack restored, dev DB untouched.
Action: **close-item** (commit MRV-9.8, Closes #60). Spec amended with the category ruling.
