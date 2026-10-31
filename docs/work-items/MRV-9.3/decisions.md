# decisions
- 2026-10-30 Captain: the registration form's account-type choice (CNPJ/CPF) belongs to MRV-9.4; here registration only gets the structured billing address. Staff widget/page (9.2) are extended to list addresses.
- Addresses are managed by their own endpoints with an opaque `key` (never the id on screen); a customer can never reach another customer's address (404).
- Tests: docs/tests/README.md; client suite alone; migration check on a throwaway Postgres (test/runtime/migration-numbering.sh is the model); no dev-DB records.
