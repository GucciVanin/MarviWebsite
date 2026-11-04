# decisions
- 2026-10-30 Captain: builds on 9.1 (numbers; no GUID on screen), 9.3 (addresses with opaque keys; migrated customers may have no billing/delivery address: the selector must tolerate it, see the spec) and 9.4 (account types). Quote/order URLs and routes use numbers.
- Free text is stored in the snapshot: any future PDF/e-mail/CSV output must escape it (Security note from 9.3).
- Coverage stays informational (existing endpoint), never blocking.
