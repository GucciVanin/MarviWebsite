# decisions
- 2026-10-30 Captain: built on MRV-9.1 (customer number in URL, never the id). Fields from later stories (CNPJ/CPF, account type, addresses) are shown only once those stories exist; the widget renders what the DTO has and "—" otherwise, and 9.3/9.4 extend it (their ACs name the widget).
- Tests: docs/tests/README.md commands; client suite alone; no dev DB records.
