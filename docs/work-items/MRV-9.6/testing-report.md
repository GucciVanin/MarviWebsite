# MRV-9.6 testing report

Verdict: **PASS**. Final uncommitted change set; no source edited, nothing committed. Environment: Windows 11, dotnet 10.0.300, host node 22.15 (client suite in Docker node:24), Playwright image 1.49.1, femtopixel/google-lighthouse (latest). Docker jobs ran one at a time. The admin password and CPFs were never printed. No dev DB write (demo-account sign-ins by API only, no form submitted).

| # | Check | Expected | Runs | Result |
|---|---|---|---|---|
| 1 | `dotnet test test/Marvi.Tests` | 695 | 695/0 failed/0 skipped, x3 | PASS |
| 2 | Client suite (Docker node:24, alone) | 1440 | 78 files, 1440 passed, x3; "2 errors" x3, all in admin-customers.spec.ts (baseline, unchanged) | PASS |
| 3 | Layout fixtures | 25/0 | 25 fixtures, 0 failed, x3 | PASS |
| 4 | `bash test/layout/run.sh` | 0 over 344, exit 0 | total 0, pages 344, skipped [], exit 0, x3 | PASS |
| 5 | `bash test/layout/axe.sh` | 0 on 60 | checked 60, violations 0, skipped 0, x3 | PASS |
| 6 | Bundle, gzip -9 -n -c per file (island excluded), fresh image build | ~230,962, gate 237,975 | 230,962 B x3 (7,013 B under the gate) | PASS |
| 7 | migration-delivery / registration / addresses / numbering | 15 / 12 / 15 / 8 | 15, 12, 15 pass x3 each; numbering 8 pass, 0 fail x3 | PASS |
| 8 | Runtime suite (`run.sh`) | 414/0 | 414 passed, 0 failed, 3 notes, exit 0, x3 | PASS |
| 9 | Lighthouse (mobile default) on /, /storefront, /contato, /privacidade | a11y 100, CLS 0 | accessibility 1.00 and CLS 0 on all 12 runs (3 each); performance 0.69, 0.69, 0.70-0.71, 0.74 (not gated) | PASS |
| 10 | `--text-zoom 2` at 320 and 375, all groups | gated categories 0 | 86 pages: only wrapped-control 227 (136 at 320, 91 at 375) and covered-text 5 (2, 3); overflow-page, overflow-element, exceeds-parent, container-edge 0; identical x3 (exit 1 only because wrapped-control/covered-text are reported) | PASS |

Notes
- Port 55432 is held by another project's container (u5d-pg), so `migration-numbering.sh` was run from a temporary copy on port 55437 (copy deleted afterwards). The other three scripts ran as shipped.
- Layout audit, fixtures-independent runs, axe, 200% text and Lighthouse ran against the throwaway compose project `marvi-audit`, seeded by `deploy/seed-demo.mjs`; it was removed with its own `down -v` (volume gone). The dev stack was down meanwhile (never `-v`) and was restored with `up -d --build` (api, client, postgres up, api healthy). Leftover `marvi-runtime_*` volumes from the runtime suite remain, as at baseline.
- No run-to-run difference in any suite (nothing "nondeterministic").

## Read-only checks on the dev stack (demo accounts, API sign-in, nothing submitted)
- Customer `cliente@` /portal: the basket shows "Entregar em" with three options (label + address, "(a completar)" marked), the default's address written out, "Verificar cobertura", "Cadastrar ou completar endereço", and the notice "o endereço é enviado a um provedor de mapas só para localizá-lo". Quotes and orders of the pre-9.6 data show "Entregar em: Endereço a confirmar"; the pre-existing order P-000002 shows its address; waiting-for-price quotes show "Alterar endereço de entrega". Same "Endereço a confirmar" on `mercado@`.
- Not exercisable on the dev data: the accept path of a Priced legacy quote (the dev DB has no Priced quote without an address, and pricing would write to it). Covered by the client specs (picker opens instead of calling the API), the API test (409 + message) and the runtime suite (409, no order row, pick, accept); not seen by eye.
- Employee: the order form has "Entregar em" selector with the loaded customer's three addresses and no free-text control (0 textareas, 0 address inputs); the "Consultar cliente" widget shows billing and default delivery addresses; the queue (/employee), history (quotes and orders list) and customer page (addresses block, Cotações and Pedidos tables with an ENTREGA column) show the address block ("Endereço a confirmar" for legacy documents).
- Scan of text, href, title, aria-label, aria-describedby, aria-labelledby, alt and placeholder on the customer portal (3 accounts), employee queue, order form, history and customer page: no GUID, no CPF-shaped number. Only customer/quote/order numbers (C-, Q-, P-) appear.
- Observation, not a 9.6 defect: the dev DB predates MRV-9.4 data (CNPJ shown as an em dash, "1 de 11 campos").
