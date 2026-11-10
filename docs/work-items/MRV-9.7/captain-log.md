# captain log

## 2026-11-03 Order to the Worker (MRV-9.7)
Spec approved (docs/specs/MRV-9.7-product-photo.md). MRV-9.8 is committed (18be1a0): `ProductRules` is the single validator, create = `POST /api/admin/products/with-setup`, `PUT` validates the whole product with the IsActive-only exception, a category is required everywhere, the client and the API share `product-rules.contract.json`. Keep ONE path: `photoToken`/`removePhoto` go through the same rules and endpoints, no new product-save path. Security follow-ups of 9.8 not to be widened: the upload endpoint gets its own rate-limit policy and a request size cap; no value echoed in messages. Bundle cap 300,000 B (was 236,945 B). CSP unchanged. Do not commit or push.

## Worker report: complete (MRV-9.7)
See worker-report.md and pr-notes.md. API 912, client 1584 (exit 0, no Errors), runtime 489/0, audit 0/384, axe 0/70, bundle 239,948 B. Reviewer two rounds.
Action: route-security (upload, serving, parsers, nginx), then route-verify.

## 2026-11-03 Worker report: complete
Photo upload (token flow), serving, cleanup, migration, SPA chooser and photo display; Reviewer two rounds. API 912, client 1584 (exit 0, no Errors), runtime 489/0, migration-photos 12/12, audit 0/384, axe 0/70, bundle 239,948 B of 300,000 B. Accepted deviations: alt="" on thumbnails beside the name text (axe image-redundant-alt), audit rule treats closed <details> as not rendered (Security confirmed it hides nothing), metadata not stripped (follow-up).
Action: **route-security** and in parallel **route-verify**.

## 2026-11-03 Security report: pass (no critical/high/medium)
Follow-ups: L-1 `^...$` regex in ProductPhotoRules TokenShape/FileNameShape lets a trailing newline through (no exploit found; use `\z` and add a %0A traversal case); L-2 PNG/WebP parsers do not cross-check pixel claims (admin-only, no server DoS); info: nginx buffers up to 6 MB before 401, removed photo cached up to a year, cleanup deletes unreferenced files older than 70 min (back up and restore DB and media together), pending-upload cap slightly exceedable under races.
Action: logged as follow-ups; Testing continues.

## 2026-11-04 Testing report: pass
Three identical runs: API 912, client 1584 (exit 0, no Errors), fixtures 25/0, audit 0/384, axe 0/70, bundle 239,948 B of 300,000 B, migrations 12/12 + 15/12/15/8, runtime 489/0, Lighthouse a11y 100 / CLS 0 on 4 routes, 200% gated 0. Browser walk passed (upload, preview, replace, remove, refusals, storefront/picker/basket/quote photos, CSP clean, keyboard). Not exercised: OS file dialog, order lines in browser (API/runtime cover). Dev stack restored, dev DB and media volume untouched.
Action: **close-item** (commit MRV-9.7, Closes #59).
