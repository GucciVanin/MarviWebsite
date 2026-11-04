# Worker report MRV-9.8 (issue #60)

**Verdict: complete.** Nothing committed or pushed. deploy/.env never read into the transcript. Dev DB untouched (`down` without `-v`; throwaway projects `marvi-runtime` and `marvi-audit`, the latter removed with its own `down -v`). Dev stack restored (`up -d --build`: API 200, SPA 200).

## Per AC
- AC-1: `ProductRules` (renamed from `ProductSetupRules`, old two-constant class absorbed) is called by create, update, data check and the import planner. `SingleProductPathTests.ThereIsOneProductValidator_...` (type scan plus source scan; mutation-checked once: a `Length > 64` in the controller fails it).
- AC-2: legacy POST removed (404/405 test); SPA service, tests, seed, runtime suite, docs moved to `with-setup`; PUT validates the whole product, `[{field,message}]`; IsActive-only exception positive and negative (`ProductWithSetupTests`, runtime section).
- AC-3: planner runs each row through `ProductRules` on the product as stored; errors carry line, SKU, field in dry run and real import; all-or-nothing kept; import screen, hint, docs updated.
- AC-4: `GET /api/admin/products/data-check`, read-only, tested with rows built directly; `docs/operations.md` section 8.
- AC-5: panel shows API messages for create and edit; `product-rules.contract.json` read by an API test and a client spec; found and fixed a real mismatch (format characters).
- AC-6: table-driven same-verdict test (rules, create, update, import dry and real) over ~58 contract cases; runtime additions; client specs.
- AC-7: project.md, architecture.md, coverage maps, CONTEXT.md, operations.md, learning-log (CI unhandled-errors entry), pr-notes.

## Numbers (final, after O-1)
- API `dotnet test`: 844, x3 identical, exit 0. Client `bash test/client.sh`: 81 files, 1546 tests, x3, NG_EXIT=0, no Errors line.
- Runtime suite: 458 passed, 0 failed, exit 0 (final code). Fixtures 25/0, layout audit 0 over 368 loads, axe 0 on 66 pairs (all exit 0, throwaway stack removed). Bundle 236,945 B (cap 300,000), first visit of `/` 124,459 B.

## O-1 (Captain rulings)
- All-or-nothing import accepted (stated in pr-notes). Category is now required by `ProductRules` for create, PUT and import alike; the data check lists category-less stored products; IsActive-only exception kept; client form, contract JSON ("no category chosen"), table test, import/PUT tests, runtime cases and docs updated. Reviewer round on the delta: accurate, three stale doc lines fixed.
- Earlier text in this report about category being optional on edit/import is superseded by this ruling.
- Not re-run: Lighthouse and 200% text (only the category select lost its "Sem categoria" option; audit and axe are clean). Not added: a test where the category is the only defect on a product being deactivated (same code path as the covered cases).

## Deviations
- Import is all or nothing (accepted by the Captain). Architecture test is a heuristic.
