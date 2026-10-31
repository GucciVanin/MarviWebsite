# Security review MRV-9.4, O-5 delta

**Verdict: pass.** No critical or high finding. M1, M3, M4 and L1 to L6 are fixed as decided. M2 is mitigated only by the rate limit (see N1): the generic message does not remove the oracle, which the Captain's decision already accepts with "resolve at approval" left as an owner option. Six low or info items below, none blocking.
Read-only static review of code, diffs, scripts and docs; nothing was run (test results are the Worker's).

## Verification of the earlier findings

| Id | Result | Evidence |
|---|---|---|
| M1 profile throttle | Fixed | `ClientProfileController.Update` has `[EnableRateLimiting(ProfilePolicy)]`; default 20 per 60 s |
| M2 generic duplicate | Partly (see N1) | one constant `DuplicateMessage` on all paths |
| M3 key ring | Documented as decided | operations.md section 5 and 7: separate backups, certificate protection listed as a pre-production follow-up. Statements are accurate (not encrypted at rest on Linux, 90-day rotation, `down -v` deletes the volume) |
| M4 canary | Fixed (see N5, N6) | `CpfKeyCheck`, Production throws on mismatch |
| L1 | Fixed | `Snapshot` has `HasBirthDate` only; the controller adds `BirthDateChanged` |
| L2 | Fixed | reveal policy 10 per 60 s, reason 3 to 200 stored beside the mask (see N2, N4) |
| L3 | Fixed | delete result checked and logged without PII; only the two named unique indexes count (`ix_client_accounts_cnpj`, `ix_client_accounts_cpf_hash` match the migration) |
| L4 | Fixed | `ContainsInvisible` walks runes (astral tag characters U+E0000.. are category Cf and are caught); applied to names, every registration text, CNPJ, CPF, e-mail and the reveal reason |
| L5 | Fixed | `no-store` on profile GET/PUT, staff detail and list, admin registration PUT and the reveal; `autocomplete="off"` on CPF, birth date and reason |
| L6 | Fixed | operations.md section 7 "Registration data and rollback" |

## Checks requested

1. **Rate limits.** `Register` 5, `Profile` 20, `Reveal` 10, window 60 s, each its own limiter (no bucket shared between policies). The method-level attribute overrides the class-level `auth` policy. Overrides of 100000 exist only in `MarviApiFactory`, `deploy/docker-compose.yml` (which carries `AllowExampleSecrets`), and the RateLimiting test; none is in `appsettings.json`. Ordering: `UseRateLimiter` runs before `UseAuthentication`, so the key is the client address only (N2). `X-Forwarded-For` handling is unchanged: nginx appends, `ForwardLimit` 1 takes the proxy-added entry; the docs still warn not to publish 8080 in production.
2. **Generic duplicate message.** Identical text for CNPJ and CPF on registration (including the unique-index race), profile (including the race) and admin edit. Status 409 on every path; the body shape differs by path (array on registration, string on profile and admin) but not within one, so it is not an oracle. The e-mail duplicate path is unchanged (Identity 400 `DuplicateUserName`) and, because the CNPJ/CPF check runs first, a duplicate CPF always wins over an e-mail collision, so e-mail cannot mask a CPF probe. Timing is not worth hiding: the duplicate answer already differs from success by status. Oracle remaining: N1.
3. **Canary.** See N5 and N6. Production refuses to start on a mismatch, the message names the setting and holds no key. The table is not reachable through any controller (only `CpfKeyCheck` uses the `DbSet`); only a database writer can change it, and that actor gains nothing. The migration is a single `CreateTable` with a working `Down`, safe to apply on a live database. The check runs after `MigrateAsync` and is skipped in the Testing environment only. `AllowExampleSecrets` does not bypass it (good).
4. **Reveal reason.** Length is checked (3 to 200) before the regex runs, so no ReDoS or large-input cost; audit write happens before the response (`TrySaveAsync`, 409 on failure, nothing returned); `no-store` kept; the audit trail is admin-only. The CPF-in-reason check is a guard against accidents, not a control (N4).
5. **Normalize / Unicode.** `CnpjRules.Normalize` upper-cases only ASCII letters and `IsValid` demands ASCII, so look-alikes (long s, Kelvin sign, full-width, Arabic-Indic digits) are rejected, not folded. Stored CNPJ is ASCII. Residual in N7.
6. **Audit and caching.** Birth date no longer in snapshots; no other new endpoint returns `RegistrationDto` without `no-store`.
7. **400 bodies.** Every `{field, message}` message is a constant or built from a label and a numeric limit; no input value is echoed. Framework binding errors name the JSON path, not the value.
8. **Suspended.** The UI read-only mode is backed by the server: `ChangesLockedField(..., includeContactFields: true)` for Suspended in both the first check and the retry loop returns 403 for any change of name, type, contact fields, tax identity or birth date. Addresses remain editable for a Suspended customer on purpose (separate MRV-9.3 rule, tested) and are not part of the registration form.
9. **Docs and guard.** The Production guard still refuses a short or example `Privacy:CpfHashKey`, a missing `DataProtection:KeysPath` and `DataProtection:Ephemeral`; the dev defaults all contain `dev-only` or `CHANGE-ME`. The operations.md statements on key-ring backup, loss, rotation and the canary are accurate.

## Findings

### N1 Medium (residual, non-blocking, already accepted): duplicate oracle remains
- Where: `AuthController.Register`, `ClientProfileController.Update`.
- Risk: a registration (personal) carries only a CPF and a business one only a CNPJ, so the field being probed is always the one the caller sent; hiding "which field" removes nothing. 409 with this text versus 201/200 still answers "is this CPF/CNPJ a customer". Bound by 5 per minute (register) and 20 per minute (profile, needs one Pending account) per address, about 7,200 and 28,800 a day per address; targeted lookups, not harvesting (about 10^9 CPFs).
- Fix: only "resolve at approval" removes it (accept the registration, flag the duplicate to staff). Keep it as the owner option already recorded.

### N2 Low: limiter is keyed by address and runs before authentication
- Where: `RateLimiting.AddPolicy`, `Program.cs` order (`UseRateLimiter` before `UseAuthentication`).
- Risk: (a) the reveal bucket cannot follow a compromised admin token across addresses; (b) unauthenticated requests to the profile or reveal route spend the bucket of everyone behind the same address (an office NAT, or every user if `ForwardedHeaders__Enabled` is missing behind a proxy); (c) the key is the exact IPv6 address, so a /64 gives an attacker practically unlimited buckets for every policy (login included, pre-existing).
- Fix: move `UseRateLimiter` after `UseAuthentication` and partition `reveal` and `profile` by user id when authenticated (address otherwise); truncate IPv6 to /64.

### N3 Low: nothing stops a production copy of the permissive limits
- Where: `ProductionConfigurationGuard`, `deploy/docker-compose.yml` (100000 for all seven policies).
- Risk: the three new policies are PII-adjacent; a deployment that copies the dev compose keeps the exemption and 100000 limits (the same pattern as before, now with more at stake).
- Fix: in Production without the exemption, add a guard problem when a `RateLimiting:*:PermitLimit` exceeds a sane ceiling (for example 1000).

### N4 Low: "CPF in the reason" check is easy to bypass and mildly over-broad
- Where: `AdminClientsController.RevealCpf` (strips only `.`, `-`, space, then `\d{11}`).
- Risk: separators such as `/`, `,`, NBSP (category Zs, not rejected), or letters between digits defeat it, so a CPF can still reach the audit trail (admin-only, typed deliberately). It also refuses any 11-digit number, such as a phone with area code, which is acceptable.
- Fix: strip every non-digit, then refuse when any 11-digit window passes `CpfRules.IsValid` (fewer false positives, harder to bypass); say in the UI hint that the reason is stored.

### N5 Info: the fingerprint is an offline verifier of the hash key
- Where: `CpfProtector.KeyFingerprint` (HMAC of a fixed phrase) stored in `app_settings`.
- Risk: someone holding the database can test key guesses without knowing any CPF. They could already do it with one known CPF and its hash, so the exposure is not new; the key is only 32+ characters with no entropy check.
- Fix: generating it with `openssl rand` is already in the docs; optionally derive the fingerprint with a slow KDF (PBKDF2) so guessing is slower.

### N6 Low: canary gaps
- Where: `CpfKeyCheck.RunAsync`.
- Risk: (a) on first start it records whatever key is configured even if CPF hashes already exist (a database written before the canary with another key), so it can bless a wrong key; not reachable in the planned production path, where both migrations ship together. (b) Two replicas starting at once: the loser gets a primary-key exception and crashes once (documented, self-heals on restart; with different keys the second start then refuses, which is right).
- Fix: when recording and `client_accounts.cpf_hash` already has rows, do not trust the record (refuse in Production or warn); catch the unique violation and re-read.

### N7 Info: Unicode classes still allowed
- Where: `RegistrationRules.ContainsInvisible`; the IE path still uses `ToUpperInvariant` (folds look-alikes to ASCII; the stored value is ASCII, so harmless).
- Risk: blank-looking letters and symbols (Hangul filler U+3164, Braille blank U+2800, private use, unassigned) are not category Cf and can still make names look empty or equal in staff screens; spoofing only.
- Fix: optional, reject `PrivateUse`/`OtherNotAssigned` and a short list of blank fillers; use the ASCII-only upper-casing in the IE path for consistency.

### N8 Info: the "mask" shows six of eleven digits
`***.456.789-**` leaves 1,000 candidates (first three digits; check digits are computed). Common LGPD display practice; noted so the privacy text does not call it unrecoverable.

## Result
Pass. No high or critical item. Before production: decide N1 (resolve at approval), N2 (IPv6 /64 and user keying) and the certificate for the key ring (already listed).
