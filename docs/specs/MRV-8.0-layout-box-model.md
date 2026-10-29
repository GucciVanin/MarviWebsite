# MRV-8.0 Layout integrity: box model, alignment, no overlap at any screen size

**Goal.** Every page, public and portal, lays out cleanly from 320 px to 1920 px: boxes do not overlap or spill, navigation never wraps into misaligned rows, and form fields and controls line up on shared edges.

**Evidence (Captain, 2026-10-29, dev stack, 1024 px, signed in as the demo employee).** Header items wrap to two lines and sit at different heights: "Nossa Rede" is 60 px tall, "Por que a Marvi" 60 px, "Painel do funcionário" 65 px, while the other items are 36 px. The signed-in header is wider than the viewport can hold at that width. The portals (admin, employee, client) were not part of the MRV-7 revamp and have not been measured at all.

**Decisions (Captain, reversible).**
- Approach is the CSS box model done properly: `box-sizing: border-box` everywhere, one spacing scale, flex/grid with explicit `gap` (no margin hacks), `min-width: 0` on flex/grid children, `flex-wrap` plus `white-space: nowrap` on single-line controls, fluid widths (`minmax`, `clamp`) instead of fixed pixel widths.
- Correctness is proven by a repeatable measurement script, not by eye: a headless-browser audit that loads every route at fixed widths and fails on overlap, overflow, wrapped controls and misaligned fields.
- Visual style does not change (MRV-7 brand stays); only geometry.

Slices (one commit each): 8.1 audit harness and shared layout primitives, 8.2 header, footer and public pages, 8.3 forms and fields (all pages), 8.4 admin portal, 8.5 employee and client portals.

## Acceptance criteria
- AC-1 `test/layout/audit.mjs` (headless Chromium in Docker, run by one documented command) signs in with the seeded demo accounts, visits every public and portal route and, at widths 320, 375, 414, 768, 1024, 1280, 1440 and 1920, reports each violation of AC-2 to AC-6 with route, width and element. It exits non-zero on any violation and is deterministic over three runs.
- AC-2 No horizontal page overflow: `documentElement.scrollWidth <= clientWidth` and no visible in-flow element extends beyond the viewport (scrollable containers such as tables may scroll inside their own box).
- AC-3 No overlap: no two visible in-flow sibling boxes intersect, and no text node box is covered by a non-ancestor box (fixed layers such as the notice and WhatsApp button must not cover primary controls or form fields at any width).
- AC-4 Single-line controls stay single line: header nav links and buttons, `.btn`, chips, tabs and icon+label pairs never wrap onto two lines; when space runs out the header collapses to the menu button (breakpoint chosen so the signed-in header fits) instead of wrapping.
- AC-5 Alignment: in every form, label/field blocks share one left edge and one width per column; fields in the same row share top edge and height; buttons in a row share height and baseline; grid cards in a row have equal heights; headings and content share the page container's left edge.
- AC-6 Box model: the audit also fails when any element's rendered box exceeds its parent's content box without being a scroll container, and when `box-sizing` is not `border-box` on any element.
- AC-7 Spacing and sizing come from tokens (spacing scale, container widths); the diff removes fixed pixel widths/heights on layout containers in favour of fluid sizing, and no new magic-number margins are introduced (reviewed).
- AC-8 Tables and wide data in the portals stay inside their own scroll container on phones and never push the page wider; row actions stay aligned and do not wrap.
- AC-9 Dialogs, dropdowns, toasts, the privacy notice and the WhatsApp button stay inside the viewport at 320 px with long pt-BR text and 200% browser text zoom.
- AC-10 Existing client tests pass unchanged or are updated with the change; the client suite is run three times identically; bundle growth stays under the 60 kB gate; Lighthouse accessibility stays 100 and CLS 0 on home, storefront and contact.
- AC-11 The audit result (zero violations at all widths, all routes) is recorded in `docs/tests/layout-audit.md` and the audit command is documented there.

## Out of scope
New visual design, dark theme, new copy, animation changes, wiring the audit into CI (offered as a follow-up), a native mobile layout.

## Open questions
None.
