# captain log

## 2026-10-29 Worker report: complete, Reviewer approve with nits (2 rounds)
admin-portal 157 -> 0 at all widths; whole run 235 -> 78 (employee/client portals, 8.5); text-zoom admin overflow 0 (26 wrapped-control reported); specs 1136; bundle 200,068 B (+1,180); public Lighthouse a11y 100/CLS 0; fixtures 19/0. Nits applied; last comment/doc edit not re-reviewed (trivial).
Decisions accepted by Captain (owner may veto at PR): phones scroll tables and the tab strip sideways instead of reflowing to cards; admin form/toolbar buttons may wrap at 200% text on phones; `.table-wrap`, `.table` and `.tabs` are shared CSS reaching employee/client tables before 8.5.
Gaps: admin pages not Lighthouse-measured; scroll-region keyboard behaviour and long validation messages not verified.
Action: **route-security**; Testing in parallel.

## 2026-10-29 Security report: pass (info only)
No template logic, guard, binding, clipping, CSP or secret findings; wrappers only; ARIA valid. Info: shared `.table` cell wrapping and button gap reach employee/client tables ahead of 8.5 (documented).
Action: **route-verify** (Testing already running).

## 2026-10-29 Testing report: layout all pass; one real a11y defect found
Client 65 / 1136 x3; fixtures 19/0 x3; audit x3 identical (md5 715b2bf3), 78 = employee 36 + client 24 + wholesale 18, admin/public 0; text-zoom as expected; bundle 200,036 B (gzip CLI with names; 199,161 B without; gate 237,975 B), home.scss budget warning pre-existing.
Axe on the 8 admin routes (375, 1280): `scrollable-region-focusable` (serious, WCAG 2.1.1) on /admin/visao-geral at 375: two new `.table-wrap` boxes are not keyboard-reachable when they overflow, caused by this slice. Also `landmark-unique` (/admin/auditoria `.card`, possibly caused by the new role=region), `heading-order` (visao-geral), `empty-table-header` (precos): not compared with HEAD.
Action: **return-worker** — make every `.table-wrap` keyboard-scrollable (tabindex 0, role region, unique accessible name), compare the other three axe findings with HEAD, fix the ones this slice caused, re-run axe and the layout audit; Security re-checks the template delta; Testing re-runs afterwards.

## 2026-10-29 Worker report (addendum): axe findings fixed, Reviewer approve with nits
Axe 0 violations on 8 admin routes at 375 and 1280; 16 `.table-wrap` now `tabindex=0 role=group aria-labelledby` (unique names); audit wrapper's role=region (which caused landmark-unique) replaced; overview card titles h3 -> h2 (visible: size lg -> 2xl, reversible, Captain accepts); pricing empty `th` now holds a visually hidden "Faixa padrão". Admin audit 0, specs 1136, fixtures 19/0. Nits: group name duplicates section name in inbox/operations/pricing (follow-up), only audit wrapper unit-asserted, `.visually-hidden` defined twice (pre-existing), focus ring not seen by eye.
Action: **route-security** (template delta) with Testing re-run in parallel.

## 2026-10-29 Security re-check: pass (info only)
Whitespace-insensitive diff: four substantive template lines (three h3->h2, hidden label in an empty th) plus wrappers; ids unique and aria targets exist; hidden text is a constant; no secrets. Info: `.visually-hidden` defined twice (pre-existing).
Action: **route-verify** (Testing re-run in progress).

## 2026-10-29 Testing re-run: all pass
Client 65 / 1136 x3; fixtures 19/0 x3; audit x3 identical (md5 1f0a14e9), 78 = employee 36 + client 24 + wholesale 18, admin and public 0; axe 0 violations on 8 admin routes x 2 widths x3; bundle 200,359 B (gzip CLI with names; 199,484 B without), gate 237,975 B; Lighthouse a11y 100, CLS 0 on home, storefront, contact.
Action: **close-item** for the slice. Follow-ups: duplicated group/section names (inbox, operations, pricing); `.visually-hidden` defined twice; unit assertions on the other 15 wrappers; focus ring and keyboard scrolling by eye; sideways-scroll tables vs card reflow (owner design choice).
