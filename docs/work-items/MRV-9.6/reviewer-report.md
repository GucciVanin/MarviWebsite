# Reviewer report MRV-9.6 (round 2, read-only; no test or suite was run by the Reviewer)

**Verdict: accurate** with 3 non-blocking findings (F-1..F-3). Test and suite results in worker-report.md are Worker claims and were not re-run.

## AC ruling
- AC-1 met: migration 20261031021719_DeliveryAddressSnapshot.cs (10 nullable columns on quotes and orders, FK SET NULL on both, indexes, Down drops them; Order.DeliveryAddress text untouched); AppDbContext.cs ConfigureDeliveryAddress; test/runtime/migration-delivery.sh (legacy-shaped data, SET NULL keeps copy, Down, Up again). It is a shell test, not an xUnit API test (spec says "an API test"): equivalent evidence on real Postgres.
- AC-2 met (route deviation): QuotesController.Create resolves via DeliveryAddressChoice.ResolveAsync (default; 400 "Cadastre um endereço de entrega."; foreign/unknown = 404; billing-only = 400); DTO carries snapshot without key. Tests DeliveryAddressTests.cs:95-205.
- AC-3 met (status deviation): QuotesController.ChangeDeliveryAddress + QuoteWorkflowService.ChangeDeliveryAddress (Submitted/Priced else 409; foreign quote 404); AcceptQuote passes deliveryTo: quote to OrderFactory.Place (QuoteWorkflowService.cs ~107) which copies snapshot and writes the Line text. Tests :206-308.
- AC-4 met: EmployeeOrdersController.Create (key resolved against clientAccount.Id => foreign key 404; legacy text only when no structured address and no key, logged; otherwise 400). Tests :352-410.
- AC-5 met (deviation): EmployeeOrdersController.ChangeDeliveryAddress + Order.CanAmendDeliveryAddress (Placed/Backordered), audited before/after via AuditLogger. Tests :413-470.
- AC-6 met: delivery-picker.ts (select by label+summary, default preselected, add link, coverage button informational, failure does not block), client-portal.html, delivery-to.ts; option value carries the opaque key (not rendered text; accepted by the no-ids scan).
- AC-7 met: employee-portal, history, customer page, lookup widget changed and specs updated; employee-portal.ts has no free-text field left.
- AC-8 met: DeliveryAddressSnapshotTests.cs:49 and DeliveryAddressTests.cs:309 (edit and remove leave quote and order unchanged); SET NULL proven on Postgres in the migration script; billing/default rules test :336.
- AC-9 met as to test content (all listed cases exist: default, explicit, none, foreign, change while Priced, 409 after Accepted, employee choice, amend, refuse Fulfilled/Cancelled, immutability, 401/403 matrix, 429, picker specs incl. coverage success/failure, add link, error states; runtime api-security section). "Three identical runs", layout 0, axe 0, bundle size are unverifiable by reading.
- AC-10 met (docs files modified: CONTEXT.md, project.md, architecture.md, docs/tests/*); content not audited line by line.

## Deviations ruled
1. /api/quotes instead of /api/client/quotes: accepted, it is the existing route (spec wording was wrong). Fix the spec text.
2. Submitted/Priced instead of Pending/Priced: accepted. QuoteStatus is Draft, Submitted, Priced, Accepted, Rejected, Expired; no Pending exists. Draft and Expired answer 409.
3. Order amend Placed/Backordered allowed, Fulfilled/Cancelled refused: OrderStatus is Placed, Backordered, Fulfilled, Cancelled; there is no Shipped. Accepted as the closest mapping; note Fulfilled is the only "shipped or later" status. Document it in the spec.
4. PUT by number: accepted (consistent with MRV-9.1, no GUIDs).
5. Concurrency tokens Quote.Status and Quote.DeliveryAddressId answering 409: accepted and wired on accept, change, reject, price (EmployeeQuotesController, QuotesController). Limit: re-choosing the SAME address after it was edited does not change DeliveryAddressId, so it does not trip the token (harmless: both writers see a consistent row). No order token (stated gap).
6. NeedsReview address choosable: accepted; labelled "a completar" in the picker.
7. Legacy free-text fallback only for customers with no structured addresses, logged: accepted. Note: a customer with only a billing-only address has "structured addresses" so free text is refused and ResolveAsync gives 400 "Cadastre um endereço de entrega" (reasonable).

## Specific checks
- Snapshot is a real copy (CopyFrom copies values; Quote/Order hold columns, DeliveryAddressId only a nullable FK). Tests exist (see AC-8).
- Every Order creation path sets the snapshot: only two Orders.Add sites (QuotesController accept via AcceptQuote; EmployeeOrdersController.Create), both through OrderFactory.Place with deliveryTo (employee legacy case intentionally has none).
- Selection rules (default / only-deliverable / none / several-no-default) in DeliveryAddressChoice.cs, with tests :95,137,152,169; messages match spec.
- No-address customer: picker shows delivery-none message and "Cadastrar ou completar endereço" link opening the profile add form; "Solicitar cotação" disabled without a key.
- Escaping: all snapshot text rendered by Angular interpolation; no innerHTML/bypassSecurity in the touched components. decisions.md notes future PDF/CSV must escape.
- Seed: labels 'Filial Campinas' and 'Depósito Guarulhos' exist in seed-demo.mjs (lines 129, 133); the quote/order calls use the new key fields.

## Findings
- F-1 (medium, risk): a quote made before this story has no snapshot. It can still be priced and accepted (QuoteWorkflowService.AcceptQuote does not require an address), producing an order with DeliveryAddress = "" and no snapshot, contradicting AC-3's "never an empty address" for that population. The customer can fix it beforehand with "Alterar endereço de entrega", and the UI shows "Endereço a confirmar", but the API does not enforce it and no test covers accepting a legacy quote. Suggest: either refuse accept (400 with the "choose an address" message) when the quote has no snapshot, or document the gap and add a test.
- F-2 (low, test gap): no unit/integration test for the real DbUpdateConcurrencyException path (InMemory cannot raise it); Worker already states it. Four 409 catch blocks are therefore unexercised.
- F-3 (low, docs): spec still says /api/client/quotes, Pending and "shipped"; worker-report says `startChange` "falls back to the default" while code sets changeKey null and the picker's effect applies the default (same effect). Also AC-1 asks for an "API test" but evidence is the shell script. Update the spec to the real names.

No claim in worker-report/pr-notes was found unsupported by the code (PR notes correctly state the missing SPA for staff amend and the missing order token). pr-notes should add F-1 to "Known gaps" if left unfixed.
