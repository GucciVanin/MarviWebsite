# Worker report MRV-9.7 (issue #59)

**Verdict: complete.** Nothing committed or pushed. deploy/.env never printed (scripts read it at run time). Dev DB not written by tests (throwaway stacks `marvi-runtime` and `marvi-audit`, the latter removed with `down -v`); dev stack restored with `up -d --build` (API 200, SPA 200; it migrated on start, which clears old image addresses, as documented).

## Per AC
- AC-1: `ProductPhotosController` + `ProductPhotoRules.Inspect` (`ProductPhotoTests`: formats, name/content-type independence, 17 refusal cases, dimensions, 5 MB/6 MB, roles, 429, rate limit test; runtime: real HTTP).
- AC-2: `with-setup`/`PUT` `photoToken`, `removePhoto`, same save; wrong tokens 400 `photo`; replace/remove/delete delete the file; cleanup with grace and test; rollback tests with the failing-audit factory; runtime: races (10 SKUs/10 photos, 6 creates/1 token).
- AC-3: `ProductMediaController`; traversal set (404) plus runtime over real HTTP.
- AC-4: panel chooser (upload at once, same-origin preview, name/size, remove, pt-BR, busy state blocks save, aria-disabled, focus); specs.
- AC-5: `app-product-photo` on cards, picker, basket, quote/order lines (DTO `ImageUrl`), admin thumbnail; first row eager, rest lazy; CLS 0. Deviation: `alt=""` beside the name in tables/lines (axe).
- AC-6: card shows description, category, attributes (escaped, tested with markup in the text).
- AC-7: CSP unchanged; nginx 6 MB for the upload location only; browser check under the CSP; real canvas JPEG/PNG/WebP accepted.
- AC-8: migration + script 12/12, compose volume, Dockerfile `/media`, operations section 9, Production guard (+tests).
- AC-9: numbers below. Three identical API runs. Layout, axe, 200% and Lighthouse extended with `product-photo` and `product-photo-error` steps.
- AC-10: CONTEXT.md (Product photo), project.md, architecture.md, coverage maps, tests README, layout-audit.md, operations.md (metadata note).

## Numbers
API 912 x3; client 1584 (exit 0, no Errors); runtime 489/0 (previous 458/0); audit 0/384 (previous 0/368); axe 0/70 (previous 0/66); fixtures 25/0; migration script 12/12; bundle 239,948 B (cap 300,000; previous 236,945); first visit of `/` 124,981 B; Lighthouse a11y 100, CLS 0 (`/storefront` x3, `/` x3).

## Review
Round 1: save-during-upload race, silent upload errors, focus/aria-busy, over-eager markup scan, cleanup race, same-token race, missing category on the card, double-read description, docs: all fixed. Round 2: order of 409/400 on a race, ALPH scan, test strength, grace test, accepted limit of the polyglot check: fixed or recorded in decisions.md.

## Deviations / unverified
- `alt=""` on adjacent-name thumbnails (axe gate); also a small change to the layout audit rule: the content of a closed `<details>` is treated as not rendered.
- Markup hidden in compressed pixel data is accepted (neutralised by the serving headers).
- Metadata not stripped (spec).
- Over a real socket a client sending a huge body may see a connection reset instead of the 413 (runtime test accepts both).
- Not run: Lighthouse on `/login` and `/contato` (unchanged pages); the same-token race has no API unit test (InMemory has no concurrency check), only the runtime test.
- WebP unit fixtures are structurally valid containers, not decodable; real encoder output was checked in the browser.
- The final runtime run and Lighthouse ran after the last code change except two doc and comment edits (nginx comment, decisions); the client image for the final bundle/client suite included everything.
