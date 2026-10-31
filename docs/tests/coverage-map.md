# Coverage map (MRV-3.5, 2026-10-28)

- API: [coverage-map-api.md](coverage-map-api.md) — every controller endpoint with the test covering success, auth failure and validation failure. `AuthorizationMatrixTests` has a drift guard: adding an `[Authorize]` endpoint without a matrix row fails the suite.
- Client: [coverage-map-client.md](coverage-map-client.md) — every Angular service, guard, interceptor and helper with its spec.
- Layout: [layout-audit.md](layout-audit.md) — the headless-browser geometry audit (MRV-8.1), its rules, self-test fixtures and the recorded baseline.

- Migrations on real Postgres (MRV-9.1, MRV-9.3, MRV-9.6): `test/runtime/migration-numbering.sh`, `test/runtime/migration-addresses.sh` and `test/runtime/migration-delivery.sh` (see README.md); addresses and the delivery address of quotes and orders (MRV-9.6) are inventoried in the API and client maps above.

Commands and determinism rules: [README.md](README.md).
