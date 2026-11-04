# decisions
- 2026-10-30 Captain: "Client ID" read as the GUID; the customer number is a separate business reference. Quotes/orders get numbers too (owner approved with the spec).
- 2026-10-30 Captain: tests run via the documented commands in docs/tests/README.md; client suite alone (not concurrently with other Docker jobs); no records left in the dev DB (runtime suite uses its own database).
