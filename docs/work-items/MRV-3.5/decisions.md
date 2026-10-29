# Decisions

- 2026-10-28 Owner chose this item for the overnight run and approved deriving ACs from the backlog. Spec decisions are listed in the spec. Outcome: proceed.

## Bugs found (API half, O6)

- 2026-10-28 None. The new API tests (`AuthorizationMatrixTests`, `CatalogEndpointContractTests`, `CoverageAdminEndpointContractTests`, `AdminClientsContractTests`, `AdminInventoryContractTests`, `QuoteEndpointContractTests`, `OrderEndpointContractTests`) all pass against unchanged production code. No skipped tests were added.
- Observation, not a bug: `POST /api/admin/products/import` answers 415 (not 401/403) to a body that is not multipart, because the content type is matched before authorization. With multipart the 401/403 contract holds and is tested.
- Section 7 of `project.md` is missing `GET /api/public/reviews` (exists in code, anonymous). Left for the Captain; see `docs/tests/coverage-map-api.md`.

## Bugs found (client)

- 2026-10-28 None. The new client specs (see `docs/tests/coverage-map-client.md`) all pass against unchanged production code. No skipped tests were added.
- Observation, not a bug: `jwtInterceptor` adds the bearer token to every request the app makes, whatever its URL. Today every call is a relative `/api/...` URL, so nothing leaks; a future call to another origin through `HttpClient` would carry the token. Pinned only for `/api` calls; not changed (AC-4).
- Observation, not a bug: `guestGuard` treats a token with a role the SPA has no portal for (not Client, Employee or Admin) as signed in and redirects it to `/`. The API issues only the three roles. Pinned in `role.guard.matrix.spec.ts`.
