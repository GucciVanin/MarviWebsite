# Coverage map (MRV-3.5, 2026-10-28)

- API: [coverage-map-api.md](coverage-map-api.md) — every controller endpoint with the test covering success, auth failure and validation failure. `AuthorizationMatrixTests` has a drift guard: adding an `[Authorize]` endpoint without a matrix row fails the suite.
- Client: [coverage-map-client.md](coverage-map-client.md) — every Angular service, guard, interceptor and helper with its spec.
- Layout: [layout-audit.md](layout-audit.md) — the headless-browser geometry audit (MRV-8.1), its rules, self-test fixtures and the recorded baseline.

Commands and determinism rules: [README.md](README.md).
