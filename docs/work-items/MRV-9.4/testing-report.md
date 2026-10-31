# Testing report MRV-9.4 (issue #55)

**Verdict: PASS, with two low findings to note (none blocks).** Every gate matched its expected number on every run; no source file was edited, nothing committed, nothing written to the dev database.

Environment: Windows 11, dotnet 10.0.300, host node 22.15 (client suite in Docker node:24), Docker Playwright 1.49.1 image, femtopixel/google-lighthouse 13.5. Final uncommitted change set.

## Results (3 runs each unless stated)

| # | Check | Expected | Runs 1 / 2 / 3 | Result |
|---|---|---|---|---|
| 1 | API `dotnet test test/Marvi.Tests` | 654 | 654 / 654 / 654, 0 failed | PASS |
| 2 | Client suite (Docker node:24, alone) | 1386 | 1386 / 1386 / 1386 (76 files) | PASS |
| 3 | Layout fixtures | 25, 0 failed | 25/0 on all three | PASS |
| 4 | Layout audit `run.sh` | 0 over 304+8 loads, exit 0, no skips | 0 violations, 312 loads, exit 0, `skipped: []`; the three outputs are byte-identical (same md5) | PASS |
| 5 | axe `axe.sh` | 0 on 50(+2) pairs | 0 violations, 52 checked, 0 skipped, exit 0; outputs byte-identical | PASS |
| 6 | Bundle, `gzip -9 -n -c` per js/css file (island excluded) | gate 237,975 B, ~226,271 B | 226,271 B x3 (measured on the served `deploy-client-1` build, which is the final code) | PASS (11,704 B under the gate) |
| 7 | `migration-registration.sh` / `-addresses.sh` / `-numbering.sh` | 12/12, 15/15, 8/8 | 12/12, 15/15, 8/8 on all three runs of each, 0 FAIL, exit 0 | PASS |
| 8 | Runtime suite (`down` without -v, `run.sh`, restore) | 388 pass, 0 fail | 388 passed, 0 failed, 3 notes on all three runs | PASS |
| 9 | Lighthouse (mobile default) on `/`, `/storefront`, `/register` | a11y 100, CLS 0 | accessibility 1.00 and CLS 0 on all 9 measurements (performance 0.68 to 0.70, not gated) | PASS |
| 10 | Audit at 200% text (`--text-zoom 2`, 320 and 375, all groups) | overflow-page, overflow-element, exceeds-parent, container-edge = 0 | 78 loads: those four rules 0 on all three runs; reported only: wrapped-control 188, covered-text 5; the three outputs are byte-identical | PASS |

Notes on the numbers:
- Item 10: the Worker reported wrapped-control 186 / covered-text 5 for 76 loads, plus 2 wrapped-control from the new `/admin/clientes#reveal` step (78 loads). 188 and 5 is exactly that, so no regression. The script exits 1 in this mode by design (reported, not gated).
- Item 8 determinism: the address and registration race tests print identical lines on all three runs ("6 simultaneous registrations of one CNPJ: exactly one 201, the rest 409, none a 500, one account and no orphan login", the CPF one, the 6 parallel address creates). All 388 PASS lines are the same on every run. Only two older MRV-3.x admin race tests (12 simultaneous price upserts; a warehouse deleted while coverage areas are added) print a different set of observed HTTP statuses in their label (`200` / `200,409`, `204,409` / `204,400`); the assertion ("no 500") passes every time. This is not MRV-9.4 code and the outcome never changes, so I do not count it as nondeterministic; a label that embeds the observed status set will make any byte-for-byte comparison of runtime output differ.
- Layout audit and axe, 200% text and Lighthouse ran against the throwaway compose project `marvi-audit` (same compose file, so ports 4200 and 8080), seeded with `deploy/seed-demo.mjs` so both account types exist (4 companies, 1 person). The dev stack was down meanwhile (`down`, never `-v`); `marvi-audit` was removed with its own `down -v`; the dev stack was then restored with `up -d --build` (all three containers up, healthy). The dev database was never wiped or written. The admin password was only passed through the environment by the scripts and never printed.
- No two Docker jobs of this project ran at once.

## Read-only checks of the UI

Dev stack (demo accounts, no form submitted): the registration page shows the account-type choice (Conta empresarial / Conta pessoal, each with its explanation). Business shows Nome da empresa and CNPJ (opcional agora); Personal shows Nome completo, CPF, Data de nascimento; both then E-mail, Senha and the address fields. At 320 and at 1280 the page has no horizontal overflow (scrollWidth equals the viewport minus the scrollbar at 1280). An existing demo customer (cliente@, on dev) sees "Dados cadastrais" in the portal; the employee's widget and customer page for C-000001 show "Tipo de conta: Empresa", "CNPJ —" and "Cadastro 1 de 11 campos" (the dev customers predate the migration, so they are Business with no data, as expected).

Seeded throwaway stack (so there is data): the employee's customer page for C-000005 (João da Silva) shows "Pessoa física", CPF `***.444.777-**`, "Cadastro Completo"; C-000002 shows "Empresa", CNPJ `12.ABC.345/01DE-35 (Filial)` and the company data. The lookup widget at 320 shows the type and masked CPF, the pop-up sits inside the viewport (8 to 312 px) and the page does not overflow. The signed-in personal customer's profile shows "Dados cadastrais" with "Tipo de conta: Conta pessoal" and no horizontal overflow at 320.

GUID and CPF scan (text, href, title, src, value, placeholder and every aria-*) on the employee page and widget, both customer pages, the customer's portal and profile: no GUID anywhere and no full CPF anywhere. The only matches were `<option value>` GUIDs of the category select on the employee page (not displayed, not new) and the format placeholder `000.000.000-00` (not a CPF).

## Findings (low, for the Captain)

1. **The customer's own locked CPF field is blank.** For an Approved personal customer the profile's CPF input is read-only, empty, and shows only the placeholder `000.000.000-00` (`registration-fields.html` binds `[value]="d.cpf()"` and nothing uses `cpfMasked`). The Worker report and `pr-notes.md` line 11 say "the owner's own profile shows the CPF masked". On the page it does not show it. Safer than showing it, but it contradicts the notes and looks like an empty required field; the fix is either to show `cpfMasked` there or to correct the notes.
2. **Staff screens show the CNPJ in full, not masked** (`12.ABC.345/01DE-35`). This matches the Worker's decision "CNPJ left as is (public)" (L1); only the CPF is masked. Stated here because the brief expected "masked CNPJ/CPF".

Not tested (out of scope of the brief): the admin edit panel and "Mostrar CPF" reveal in the browser (no admin password was used); they are covered by the audit/axe steps (`#registration`, `#registration-personal`, `#reveal`, all 0) and by the API and runtime suites.

Raw outputs of the runs are in the session scratchpad only; nothing else was added to the repository.
