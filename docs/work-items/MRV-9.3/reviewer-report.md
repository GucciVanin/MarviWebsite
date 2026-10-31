# Reviewer report MRV-9.3 (round 2)

Verdict: accurate, with two low findings (L-1, L-2). Static review of the uncommitted change set. Test counts, the runtime suite, the layout audit and the bundle size were NOT re-run (read-only, no Docker); they are taken from the Worker report.

## AC
- AC-1 met (declared deviation: bash script). Migration 20261030204101_ClientAddresses.cs:15-107 creates the table, copies billing (:77-82) and shipping (:83-89) text with needs_review, drops both columns (:101-107). Down :110-136 re-adds the columns, writes the text back (billing; up to 10 others, billing excluded) and drops the table. Loss on Down: the structure (flattened to one line) and any non-billing address beyond 10; noted in a comment.
- AC-2 met. ClientProfileController.cs (diff) returns addresses, billingAddressKey, defaultDeliveryKey; PUT takes the company name only; ClientAddressesController.cs:381-391 has POST/PUT/DELETE by key. The database Id is not in ClientAddressDto.
- AC-3 met, one mismatch (L-1). ClientAddressRules.cs:36-135: required parts, lengths, UF of 27 (:52), control/format chars (:68-72, :138-139), 20 limit (ClientAddressService.cs:187), duplicate by CEP+number+complement folded for case and accents (:116-135, service :192, :230).
- AC-4 met. Delete refuses billing and default with 409 (service :257-265); the default is always delivery-capable, so the last capable address is covered. Type change that would break either is 409 (:236-244). Flags move in a relational transaction, clear first and set second (:291-343); the filtered unique indexes (AppDbContext, migration :60-72) back this. A failed step rolls back by disposal of the transaction.
- AC-5 met (not re-run in a browser): cards, form, confirmations and key-based tracking in client-profile.html:27-43; keys appear only in `track` and comparisons, never as text. no-ids-on-screen.spec.ts:79-87 checks GUID-shaped keys.
- AC-6 met by code and specs (mask spec, UF select, layout fixture and audit entries); not re-run.
- AC-7 met. Lookup widget, customer page and admin list show addresses (keys via ClientProfileDto, staff only). Admin fix: AdminClientsController PUT {id}/addresses/{key} (404 on another customer's key); audit entries named by the owner's customer number (AdminAuditLogController diff).
- AC-8 met. AuthController diff: structured billing address checked before the user is created, stored as Both + billing + default regardless of the sent kind. Tests: ClientAddressTests (create/list, validation, 20, duplicates, 409s, cross-customer 404, 401/403, suspended, audit) and runtime api-security.mjs:355-384.
- AC-9 met as to documents (project.md, architecture.md, CONTEXT.md, coverage maps are modified); numbers (517 API, 1290 client, 357 runtime, 3 runs) not re-verified here.

## Mismatches and risks
- L-1 (spec vs code, low): AC-3 says the CEP is stripped of "-" AND spaces. The code accepts only `^\d{5}-?\d{3}$` (ClientAddressRules.cs:82); "01001 000" is refused with the "8 digits" message, and ClientAddressRulesTests.cs:62 asserts that refusal. Stricter than the spec and not listed under the declared deviations. Either note it in the spec/report or strip spaces.
- L-2 (low): the 20-address limit answers 400, not 409; the spec does not fix the status for it, but the Worker report groups it with the 409 rules. Wording only.
- Known and acceptable: the create race on the 20 limit and on duplicates (no unique index; flags are protected), as declared. A customer migrated with empty billing text has no billing row until they add one (migration comment :74-76); the profile DTO then has a null billingAddressKey, so SPA and later stories (MRV-9.6) must tolerate it.
- Admin PUT cannot demote a flag (false is ignored); declared.
- No atomicity proof in xUnit (InMemory); proven only by the runtime suite on Postgres, as declared.
- Registration is not audited; consistent with account creation elsewhere.

## Claims the code does not support
None found beyond L-1.
