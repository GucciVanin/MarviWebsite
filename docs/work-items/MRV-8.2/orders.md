# MRV-8.2 orders (issue #47) — header, footer and public pages

Serves AC-2..AC-7, AC-9, AC-10 for the public surface. Baseline: groups public 166, public-notice 195, public-as-employee 130 violations (docs/tests/layout-audit.md). Audit: `bash test/layout/run.sh`.

- O-1 Header: fix so nav links, brand and signed-in controls never wrap or sit at different heights at any width. Brand link single-line at every width; choose the collapse breakpoint so the signed-in header (with "Painel do funcionário" and "Sair") fits, else it uses the menu button. Same height for all items.
- O-2 Footer, privacy notice and WhatsApp button: no covering of text/fields at any width (including 320 px and 200% text zoom); notice stacks above the button without overlap.
- O-3 Public pages (home, storefront, contato, privacidade, login, register, and the 404/redirect states present): remove violations of wrapped-control, exceeds-parent, overflow-element/page, form-row, form-column-width, card-height, container-edge, covered-text; `.stat__icon` box-sizing. Use the 8.1 primitives (`.cluster`, `.grid-auto`, tokens) with flex/grid gap and `min-width: 0` instead of fixed widths and margin hacks. Judge any finding that is intended design (e.g. card-height on contact) in decisions.md with the reason, and adjust the audit exemption narrowly rather than weaken the rule globally.
- O-4 Update affected specs; keep the MRV-7 look. Record the new audit numbers (public groups must be 0) in docs/tests/layout-audit.md; update project.md/architecture.md.

Constraints: no API changes; no new dependency; stay within bundle gate; Lighthouse accessibility 100 and CLS 0 on home, storefront, contact (re-measure); reduced-motion behaviour unchanged; do not touch portal templates (8.4/8.5).
