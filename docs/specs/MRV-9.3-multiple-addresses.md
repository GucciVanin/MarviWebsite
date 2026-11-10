# MRV-9.3 Several addresses per customer account

**Goal.** A customer can keep as many named addresses on one account as they need (headquarters, branches, warehouses, delivery points), each in the Brazilian structure, and choose which one is the billing address.

**Evidence (Captain, 2026-10-30, code read).** The account stores one free-text `BillingAddress` and a `List<string> ShippingAddresses` (max 10, trimmed and de-duplicated by `ClientProfileRules`). The profile page edits them as text lines. Nothing structured exists, so staff cannot sort, validate or reuse an address, and the registration form asks for one free-text address.

**Decisions (Captain, reversible).**
- Addresses become rows in a new table `ClientAddress` (owned by `ClientAccount`) with: `Label` (apelido, e.g. "Matriz", "Filial Campinas", ≤60), `Kind` (`Billing` | `Delivery` | `Both`), `PostalCode` (CEP, 8 digits), `Street` (logradouro, ≤200), `Number` (≤20, "s/n" allowed), `Complement` (≤100, optional), `District` (bairro, ≤100), `City` (≤100), `State` (UF, one of the 27), `Country` (fixed "Brasil" for now, stored as `BR`), `DeliveryNotes` (horário, referência, ≤300, optional), `IsDefault`.
- Exactly one address is the **billing address** (`Kind` Billing or Both) and exactly one **default delivery address** (Delivery or Both) among the delivery-capable ones. A customer may have up to 20 addresses.
- Validation is structural only: CEP is 8 digits (shown `00000-000`), UF is in the list, required fields present. No CEP web lookup in this story (a browser call to a third party breaks the CSP and leaks data); a server-side CEP lookup is a follow-up.
- Legacy data: the migration turns `BillingAddress` into one address with `Kind=Both`, `IsDefault`, label "Endereço principal", the old text copied into `Street`, and `NeedsReview=true`; each old shipping string becomes a `Delivery` address the same way. The profile shows a "Complete este endereço" prompt on rows flagged `NeedsReview`; the flag clears when the customer saves a valid structured address. The old columns are dropped in the same migration after copying (reversible `Down`).
- Registration keeps one address form (billing) in the new structure, after the account-type choice of MRV-9.4 (a personal account uses the same address structure); further addresses are added on the profile page. Choosing an address on quotes and orders is MRV-9.6.
- Choosing an address per quote and order is MRV-9.6 (it depends on this story).

## Acceptance criteria
- AC-1 Migration creates `ClientAddress`, copies legacy billing and shipping text as described, drops `BillingAddress` and `ShippingAddresses`, and its `Down` restores them from the rows; an API test runs the migration on a database seeded with the legacy shape.
- AC-2 `GET /api/client/profile` returns `addresses[]` (without internal ids exposed to the page; each address has an opaque `key` used only in API calls) plus `billingAddressKey` and `defaultDeliveryKey`. `PUT /api/client/profile` accepts company data only; addresses are managed by `POST/PUT/DELETE /api/client/addresses[/{key}]`.
- AC-3 Rules in one place (`ClientAddressRules`, shared by registration and profile): required fields, CEP 8 digits after stripping `-` and spaces, UF valid, lengths as above, no control characters or line breaks, at most 20 addresses, duplicate (same CEP, number, complement ignoring case and accents) refused with a clear message.
- AC-4 Deleting the billing address, or the last delivery-capable address, is refused (409) unless another is chosen first; making an address the billing or default delivery address unsets the previous one in the same transaction.
- AC-5 Profile page: an address list as cards (label, formatted address, kind badges, "Principal"/"Entrega padrão" markers), an "Adicionar endereço" form with one labelled field per part (CEP, logradouro, número, complemento, bairro, cidade, UF select, notas de entrega, tipo, definir como principal), edit and remove with confirmation, pt-BR messages, busy and success states, no GUID shown.
- AC-6 CEP input masks to `00000-000` while typing; the UF select lists the 27 states; fields align on shared edges and the form passes the layout audit and axe at all widths.
- AC-7 Staff views (MRV-9.2 widget and page, admin customers) show the billing address and list the others; the admin edit panel can fix an address (audited, `ClientAddress` entity), and every address change by anyone is written to the audit log.
- AC-8 Registration form posts the structured billing address; the backend creates it as `Kind=Both`, default. API and client tests cover success, each validation failure, 401/403 and cross-customer access (customer A can never read or change customer B's addresses: 404).
- AC-9 `docs/tests/coverage-map.md`, `project.md`, `architecture.md` and `CONTEXT.md` (**Address**, **Billing address**, **Delivery address**) are updated; API and client suites pass three times; runtime suite adds one address create/list on real Postgres.

## Out of scope
Choosing an address on a quote or order (MRV-9.6), CEP lookup, map/geocoding of addresses (coverage keeps its own check), international addresses, address book import.

## Open questions
None.
