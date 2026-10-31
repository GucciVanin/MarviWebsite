# Security review MRV-9.3 (several addresses per customer)

**Verdict: PASS.** No critical or high findings; no medium. Four low and two informational notes, none blocking.

## Scope read
ClientAddressesController, ClientAddressService, ClientAddressRules, ClientAddress, DTOs/requests, AdminClientsController.UpdateAddress, AuthController.Register, ClientProfileController, EmployeeClientsController, AdminAuditLogController, AppDbContext config, migration 20261030204101_ClientAddresses, test/runtime/migration-addresses.sh, deploy/seed-demo.mjs, address-fields SPA component.

## Checks
1. **Authorization.** Customer endpoints are `[Authorize(Roles="Client")]`; the account comes only from the token's client-id claim (no id in the route/body), missing claim gives 403. Every lookup is by `Key AND ClientAccountId` (update/delete/create-dup), so another customer's key answers 404, identical to an unknown key (no existence leak). Admin `PUT /api/admin/clients/{id}/addresses/{key}` is under the class-level Admin role; key is again scoped to `{id}`. Keys are `Guid.NewGuid()` (random, unique index), only returned to the owner/staff. Pending and Suspended customers may manage addresses (same as profile, by design; bounded by the 20 limit). Staff DTOs (employee customer page) expose a customer's addresses: intended (AC-7), role-gated.
2. **Input and storage.** Single rule set; control, line/paragraph separator and format (zero-width, bidi) characters rejected; lengths, CEP regex, UF whitelist, enum `IsDefined` (blocks numeric out-of-range kinds). Persistence via EF (parameterised). Mass assignment: the request record has no ownership/NeedsReview/Id/Key fields; `IsBilling`/`IsDefaultDelivery` only ask to promote and are validated against Kind; `NeedsReview` is only cleared server-side; registration ignores flags/kind and forces Both/billing/default. Invariants one billing/one default are backed by filtered unique indexes plus a relational transaction; violations map to 409.
3. **Migration.** Up copies all legacy text (left 500, column widened to 500), then drops old columns; Down recreates columns, rebuilds text, keeps billing and up to 10 others (documented loss only beyond the old 10 limit). Script: container bound to `127.0.0.1:55434`, throwaway password, fixed container name removed by trap on exit, never touches the dev stack or volume. No credential concern.
4. **Audit.** Entries record label, kind, flags, before-state, actor role, MovedFrom labels; no street/CEP/notes/PII beyond the customer-chosen label. Admin audit page names an address by the owner's customer number only.
5. **SPA.** No `innerHTML`/bypassSecurity in the change; values rendered by Angular interpolation/ngModel; `track address.key` only, key never displayed; CEP mask strips non-digits and caps at 8, server re-validates.
6. **Registration.** Still under the Auth rate-limit policy; a single address row per request; null/invalid address gives 400 before the user is created; flags/role-style extra fields ignored (runtime suite checks extra properties).
7. **seed-demo.mjs.** Only structured demo addresses and public demo data; passwords come from the existing constants/env, nothing new.

## Findings
| # | Sev | Location | Risk | Fix |
|---|-----|----------|------|-----|
| 1 | Low | ClientAddressService.CreateAsync | Parallel POSTs can read the same count and exceed 20 addresses or insert two duplicates (only the flags have DB constraints). Bounded by the auth'd customer and request size; no privilege gain. | Serialize per customer (e.g. `SELECT ... FOR UPDATE` on the client_accounts row inside the transaction) or a unique index on (account, postal_code, folded number, folded complement). |
| 2 | Low | ClientAddressService.UpdateAsync / DeleteAsync | Reads outside the transaction; a concurrent delete/update can yield an unaudited-state 500 or lost update instead of clean 409 in rare races (indexes still protect invariants). | Catch `DbUpdateConcurrencyException` and answer 409. |
| 3 | Low | ClientAddressesController | Pending/Suspended customers can write addresses (up to 20 rows each, audited writes). Acceptable per spec, but unbounded request rate (no per-user limit on these endpoints). | Optional: apply a rate-limit policy to the three write endpoints. |
| 4 | Low | Admin PUT with an unknown customer id | Returns 404 only for admins; no leak to lower roles. Noted for completeness. | None. |
| 5 | Info | Stored free text | Fields may legitimately contain `<`, `&`; safe in Angular today. Future consumers (PDFs, e-mails, CSV export for MRV-9.6+) must escape/neutralise leading `= + - @`. | Handle at those outputs. |
| 6 | Info | Audit `Label` | The customer-chosen label is stored in audit details permanently (removed addresses keep it). | Fine; mention in privacy retention if labels may hold names. |
