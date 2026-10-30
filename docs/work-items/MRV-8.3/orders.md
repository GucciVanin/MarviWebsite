# MRV-8.3 orders (issue #48) — forms and field alignment

Serves AC-5, AC-7, AC-9 (dialogs/dropdowns in forms), AC-10. Baseline after 8.2: whole run 305, form-column-width 46 (portal forms), plus form-row/form-left-edge/card-height wherever they occur in portals. Audit: `bash test/layout/run.sh`.

- O-1 One form layout system in the shared styles (`.form-grid` / `.field` / `.form-actions` or the existing equivalents extended): grid with `minmax(0, 1fr)` columns and one gap token; labels above fields; every field in a column the same width and left edge; same-row fields the same height (inputs, selects, date, file, textarea min-height, color); actions row aligned to the grid, buttons equal height, wrap-safe. Hints and errors reserve no stray offsets and never shift neighbouring fields.
- O-2 Apply it to every form, filter bar and toolbar in the app (public forms already pass; admin, employee and client portal forms, import, pricing, catalog, customer edit, quote/order forms, inline editors, product picker). Only form markup/classes and component styles for forms; no changes to non-form portal layout (tables, dashboards: 8.4/8.5).
- O-3 Dialogs, dropdowns and selects inside forms stay inside the viewport at 320 px (AC-9); long pt-BR labels and validation messages wrap inside their field block without pushing the grid.
- O-4 Drive `form-column-width`, `form-row`, `form-left-edge`, `card-height` (in forms) to 0 across all groups at all eight widths without weakening a rule; narrow fixtured exemptions only, justified in decisions.md. Re-run `--text-zoom 2` and report. Update specs, docs/tests/layout-audit.md, project.md, architecture.md.

Constraints: no API changes, no new dependency, MRV-7 look, bundle under the gate, Lighthouse a11y 100 and CLS 0 on home/storefront/contact, public groups stay 0, `.btn`/`.chip` nowrap rules from 8.2 unchanged. Dev DB: audit only reads; if you must exercise forms by eye, do not submit anything against the dev DB.
