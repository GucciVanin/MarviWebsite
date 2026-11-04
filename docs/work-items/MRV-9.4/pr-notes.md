# MRV-9.4 PR notes (for the owner's review)

**What this feature does:** a customer registers as a business (CNPJ, company data) or a person (CPF, birth date, 18 or older); the verified record is locked for the customer after approval and only an admin changes it (audited). The CPF is stored encrypted and shown masked everywhere except the audited admin "Mostrar CPF".

## Behaviour changes the owner should know
- **A Suspended customer can no longer edit anything in their registration, including the company name** (MRV-2.2 let them rename it). The profile shows the form read-only with the reason; the API answers 403. An Approved customer can still change phone, e-mail for the invoice and the contact person; everything else is locked (403 "entre em contato com a empresa").
- **Existing customers become Business accounts with no data.** Approved customers cannot fill in their own CNPJ any more (it is part of the locked record): an admin enters it (Clientes, Editar, Dados cadastrais). People must be switched to a personal account by an admin once. Steps: `docs/operations.md` section 7.
- **Registration is limited to 5 per minute per client address** (sign-in stays 10), saving the profile to 20 per minute, "Mostrar CPF" to 10 per minute.
- **Duplicate CNPJ/CPF gets one generic answer** that does not say which number or whose. Owner option (veto): resolve duplicates at approval instead (see decisions.md).
- **"Mostrar CPF" asks for a reason** (3 to 200 characters), kept in the audit entry.
- **The owner's own profile shows the CPF masked** (stricter than the spec's "full to the owner"): an Approved customer sees `***.444.777-**` in the read-only field; a Pending customer sees it as the current value in the hint, with an empty field to retype it. The full number is never in the page.
- **Staff see the CNPJ unmasked** (formatted): it is public registry data. Only the CPF is masked for staff.
- The audit trail records no birth date. The reveal reason may not contain a CPF-looking number.
- The three new limits are per client address (like the existing ones): behind a shared office address, registrations (5 per minute) and reveals (10 per minute) are shared by everyone on that address. Acceptable now; per-user limits are a follow-up.
- The key-ring canary records its fingerprint on the first start with this feature; two replicas starting at the very same instant could make one start fail once on the insert (it starts on retry).

## New things to operate
- `Privacy__CpfHashKey` (set once, never changed; a changed key stops a Production start) and `DataProtection__KeysPath` on a persistent volume, backed up **apart from** the database. Certificate protection of the key ring is a follow-up to do before the first real CPF. See `docs/operations.md` sections 2, 5 and 7.
- Two migrations: `ClientRegistrationData` (rollback drops the registration data) and `CpfKeyFingerprint` (the canary table).

## How each story piece was verified
See `worker-report.md` (suites, runtime suite on Postgres, layout audit, axe, 200% text, Lighthouse, bundle).
