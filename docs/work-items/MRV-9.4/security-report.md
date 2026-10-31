# Security review MRV-9.4 (uncommitted change set)

**Verdict: pass.** No critical or high finding. Two mediums (M1, M2) and two more (M3, M4) are real exposures; M1 should be fixed before the PR, because it is cheap and makes M2 much worse than the Worker's note assumes.
Read-only review: code, diffs, scripts and docs; nothing was run.

## What was checked and holds
- CPF at rest: `CpfProtector` (Data Protection, purpose `Marvi.ClientAccount.Cpf.v1`, default AES-256-CBC + HMACSHA256) for the value, HMAC-SHA256 with `Privacy:CpfHashKey` for uniqueness. Keys persist on the `marvi-dataprotection` volume at `/keys`, outside the repo and the image (the Dockerfile only creates an empty folder). No key material or CPF in git.
- Production guard: requires `Privacy:CpfHashKey` (32+ chars, no `change-me`/`dev-only`/`placeholder`/`example-value`), `DataProtection:KeysPath`, and refuses `DataProtection:Ephemeral`. The dev defaults in `appsettings.json`, `.env.example` and the compose fallback all contain `dev-only` / `CHANGE-ME`, so they trip the guard.
- Exposure: DTOs carry `HasCpf` + `CpfMasked` only; staff (Employee) DTOs use the same masked `RegistrationDto`; audit snapshots mask the CPF (`Snapshot`, `Reveal` entry); no value is echoed in validation messages or exceptions; the SPA has no storage/console use for the fields; the revealed CPF lives in one signal, cleared on hide/close/edit.
- Reveal: `AdminClientsController` is `[Authorize(Roles="Admin")]` for the whole class; reveal is a POST, audited first (nothing is returned when the audit save fails), `Cache-Control: no-store`, 404 when no CPF or keys lost.
- Authorization: lock-after-approval is enforced server-side in one place (`ChangesLockedField`, re-checked inside the concurrency retry loop), covering type, name, CNPJ, CPF (by hash), razão social, fantasia, IE, IM, CNAE, regime, opening date, birth date; Suspended customers edit nothing (403). No mass assignment: request records carry no status/id/lock fields; the account comes from the token; business payload with CPF/birth date and personal payload with company fields are rejected. A customer cannot reach another customer's record (no id in the route). Admin edit and reveal take an id but are admin-only.
- Validation: `CnpjRules`/`CpfRules` use no regex (no ReDoS), ASCII-only digit and letter tests, bounded lengths (DB `HasMaxLength` too), control characters refused, phone charset whitelist. EF parameterises everything.
- Migration: additive, default Business, no data invented, unique indexes tolerate NULLs, tested Up/Down/Up. `migration-registration.sh` binds `127.0.0.1:55435`, throwaway password, `trap` removes the container. `seed-demo.mjs` uses the public test numbers (111.444.777-35, 11.222.333/0001-81, the Receita example) and a fictional person.
- Privacy page text matches behaviour (encrypted, masked for staff, admin-only full view, each view logged).

## Findings

### M1 Medium: authenticated CPF/CNPJ existence oracle with no throttle
- Where: `ClientProfileController.Update` (`PUT /api/client/profile`), `DuplicateAsync` then 409 "CPF já cadastrado." / "CNPJ já cadastrado." A Pending customer can change type, CPF and CNPJ freely; this controller has no `[EnableRateLimiting]` (only `AuthController` and the address endpoints have one).
- Risk: one throwaway registration gives unlimited probes ("is CPF X / CNPJ Y a Marvi customer?"), far beyond the 10 per minute per IP of the anonymous route. For a CPF it reveals that a named person buys from an alcohol distributor.
- Fix: put a rate-limit policy on the profile PUT (reuse `AddressesPolicy` or a new `Registration` policy, e.g. 10 to 20 per minute per user or per IP). Optional: count 409s separately and slow down after a few.

### M2 Medium: anonymous registration oracle (409 on duplicate CPF/CNPJ)
- Where: `AuthController.Register` (`DuplicateAsync` before the user is created, and the race catch).
- Risk: CNPJ is public registry data, so confirming it is a customer is low. CPF is personal data: confirms identity plus relationship. Rate limit is 10 per 60 s per client address (about 14,000 per day per IP, trivially widened with several addresses), a valid CPF has about 10^9 candidates so only targeted lookups are practical, not harvesting. The e-mail existence leak (Identity `DuplicateUserName`) is pre-existing and already of the same kind, so the marginal exposure is mostly the CPF.
- Does it block? No. Accepting it was an explicit, documented decision and the unique constraint is kept. Recommended mitigation in order of cost: (a) stricter limit for the register route than for login (for example 3 to 5 per minute per address); (b) for a duplicate CPF return the same response as success (201, generic) and e-mail the existing address owner is not possible without the owner's address, so instead keep the 409 but with a generic text ("Não foi possível concluir o cadastro com estes dados. Fale com a empresa.") shared by CPF and CNPJ; (c) long term: accept the registration and resolve the duplicate at approval time by staff, which removes the oracle entirely. Record the owner's choice.

### M3 Medium: Data Protection keys are stored unencrypted, and the docs say to back them up with the database
- Where: `IdentityModule` (`PersistKeysToFileSystem`, no `ProtectKeysWith...`), `docs/operations.md` section 7.
- Risk: on Linux the key ring XML is plaintext in `/keys`. Anyone who gets the volume or a combined backup (database dump plus keys folder in one archive) can decrypt every CPF, which makes the encryption add nothing against backup theft. The HMAC hash key also sits in the same environment; with the key plus a database leak, all CPF hashes fall to a 10^9 enumeration in minutes (acceptable only while the key stays secret).
- Fix: protect the key ring with a certificate or a key held outside the volume (`ProtectKeysWithCertificate` or a secret-store key) or document that the keys backup must be stored separately from database backups, with separate access. Check the volume and backup file permissions (owner only, 0600) in the deployment runbook.

### M4 Medium (process): key or hash-key loss and rotation consequences are real but documented
- Lost Data Protection keys: CPFs show as `***.***.***-**`, reveal answers 404, customers must be asked again (handled gracefully, `Reveal` catches `CryptographicException`). Changed `CpfHashKey`: uniqueness silently stops holding for existing CPFs and duplicates become possible; nothing detects this. Fix: store a hash-key version/fingerprint (or a canary row) and have the guard or startup log refuse a mismatch; at minimum keep the sentence in operations.md prominent next to the secrets list. Not blocking.

### L1 Low: audit snapshots hold the birth date and tax identity in the clear
`ClientRegistrationService.Snapshot` writes `BirthDate`, CNPJ, phone, invoice e-mail to the audit entries (retained, visible to admins). Birth date is personal data. Fix: mask or omit the birth date (record only "changed") and state the audit retention in the privacy text.

### L2 Low: the reveal has no rate limit and no reason
Admin-only and audited, but a compromised admin token can enumerate every CPF quickly (one audit row each). Fix: apply a per-user limit (for example 20 per minute) and alert on bursts.

### L3 Low: race fix assumptions (`AuthController.Register`)
It deletes only the user created by this very request, so it cannot remove a legitimate user, and it clears the change tracker first. Weak points: any unique-index violation is reported as "CPF/CNPJ já cadastrado" (it could be another constraint); the `DeleteAsync` result is not checked, so a failed delete leaves an orphan login and that login's e-mail then answers "already taken" at the next try; the pre-existing gap (an exception between `CreateAsync` and `SaveChangesAsync` other than the constraint case) still leaves orphans. No new e-mail existence leak. Fix: check the delete result and log it (without PII); distinguish the violated constraint by name.

### L4 Low: Unicode format characters
Names (razão social, fantasia, responsável) refuse `char.IsControl` but allow format characters (bidi overrides, zero-width), usable for display spoofing in staff screens. Also `ToUpperInvariant` folds a few non-ASCII letters (long s, dotless i) into ASCII in CNPJ/IE, which is harmless because the stored value is the ASCII result. Fix: reject `UnicodeCategory.Format` and `Surrogate` in the text fields.

### L5 Low: caching and autofill hints
Profile and staff customer responses carrying the masked CPF and birth date have no `Cache-Control: no-store` (only the reveal does). The birth-date input has no `autocomplete="off"` (the CPF and CNPJ inputs do). Fix: add `no-store` to the profile/registration responses (a global filter on the Identity controllers) and `autocomplete="off"` (or `bday` is not wanted) on the date field.

### L6 Low: migration `Down` destroys registration data by design
Dropping the columns discards CPF ciphertext and CNPJs; acceptable and tested, but say in operations.md that a rollback loses the data and needs a pre-rollback backup.

### I1 Info: CPF check-digit rule not confirmed against a Receita page
Recorded in decisions.md; functional only, no security effect.

## Result
Pass. Recommended before opening the PR: M1 (rate limit on the profile PUT), and a decision on M2/M3 recorded in decisions.md. L1 to L6 can be follow-ups.
