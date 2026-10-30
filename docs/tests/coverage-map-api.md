# API coverage map (MRV-3.5, issue #39)

Every endpoint of every controller under `src/Marvi.Api/Features/**/*Controller.cs`, with the HTTP-level test (through `MarviApiFactory`, InMemory) that covers success, an auth failure and a validation or not-found failure. Test files are under `test/Marvi.Tests`.

Legend: **AUTH** = `AuthorizationMatrixTests` (`Identity/AuthorizationMatrixTests.cs`), which asserts for every protected endpoint below that a visitor gets 401, each role the endpoint does not allow gets 403, and each allowed role gets past the gate. "gap before" means no test pinned that cell before MRV-3.5; the "added" column names the test that now does. n/a = the endpoint is anonymous or has no input to validate.

## Inventory against `project.md` section 7

- 66 route/verb pairs in code (plus `GET /health` in `Program.cs`).
- Mismatches (reported, the table was not edited):
  1. `GET /api/public/reviews` (`PublicReviewsController`, Anonymous) exists in code but is **not in the section 7 table**.
  2. `GET /api/employee/inventory/history` is marked ○ (missing) in the table and is indeed **not in code**: consistent, no action.
  3. The table row "CRUD `/api/admin/products`, `/api/admin/deals`" and "CRUD `/api/admin/categories`" match the code (GET list, GET id, POST, PUT id, DELETE id). `GET/PUT /api/client/profile`, `POST /api/auth/*`, `GET /api/public/stats`, `POST /api/public/contact` all match.
- Every endpoint marked ✔ now has at least one HTTP-level test (AC-2). Before MRV-3.5 the endpoints without any direct HTTP test were: `GET /api/deals`, `GET /api/admin/deals`, `GET /api/admin/deals/{id}`, `GET /api/admin/warehouses`, `GET /api/admin/warehouses/{id}`, `GET /api/admin/coverage-areas`, `GET /api/admin/coverage-areas/{id}`, `GET /api/employee/quotes/queue` (only a role check), `GET /api/orders/mine` happy path with no orders, `GET /api/admin/products/{id}/pricing` 404 path.

## Map

| Controller | Endpoint | Success test | Auth test | Validation / not-found test | Gap before -> added |
|---|---|---|---|---|---|
| AuthController | `POST /api/auth/register` | `AuthControllerTests` | n/a (anonymous) | `IdentityValidationTests`, `AuthControllerTests` (duplicate) | none |
| AuthController | `POST /api/auth/login` | `AuthControllerTests`, `TestClients.LoginAsync` | n/a (anonymous; throttled: `RateLimitingTests`) | `AuthControllerTests` (bad password) | none |
| AdminEmployeesController | `POST /api/admin/employees` | `PrincipalTests`, `IdentityValidationTests` | AUTH | `IdentityValidationTests` (email, code, length) | auth -> AUTH |
| AdminClientsController | `PUT /api/admin/clients/{id}/approve` | `CustomerApprovalTests` | `CustomerApprovalTests` (403, 401); AUTH | `IdentityValidationTests` (404); `AdminClientsContractTests.UnknownPricingTier_Is400...`, `ApproveAgain_Is409...` | tier 400 and 409 -> `AdminClientsContractTests` |
| AdminClientsController | `PUT /api/admin/clients/{id}/suspend` | `CustomerApprovalTests`, `ClientDirectoryTests` | AUTH | `AdminClientsContractTests.UnknownCustomers_Are404...`, `ApproveAgain_Is409_AndSuspendTwiceIs409` | 404, 409 and auth -> added |
| AdminClientsController | `PUT /api/admin/clients/{id}/pricing-tier` | `UpdateClientTierTests` | `UpdateClientTierTests` (403, 401); AUTH | `AdminClientsContractTests.UnknownCustomers_Are404...`, `UnknownPricingTier_Is400...` | 404, 400 -> added |
| EmployeeClientsController | `GET /api/employee/clients` | `ClientDirectoryTests` | `ClientDirectoryTests` (403, 401); AUTH | `ClientDirectoryTests` (`page=0` is 400) | none |
| EmployeeClientsController | `GET /api/employee/clients/{id}` and `/by-number/{number}`: `ContactEmail` (MRV-9.2) | `CustomerNumberTests.StaffSeeTheCustomersLoginEmail...` | same test (customer 403, visitor 401; own profile has no e-mail field); runtime suite | none | none |
| EmployeeClientsController | `GET /api/employee/clients/by-number/{number}` (MRV-9.1) | `CustomerNumberTests.ByNumber_ReturnsTheSameBodyAsById` | `CustomerNumberTests` (403, 401); AUTH | `CustomerNumberTests.ByNumber_AnswersNotFound...` (404 unknown, 400 not digits) | none |
| AdminCustomersController | `GET /api/admin/customers/by-number/{number}` (MRV-9.1) | `CustomerNumberTests.TheAdminByNumberEndpoint...` | `CustomerNumberTests` (403, 401); AUTH | `CustomerNumberTests.ByNumber_AnswersNotFound...` | none |
| EmployeeClientsController | `GET /api/employee/clients/{id}` | `ClientProfileTests`, `AdminClientsContractTests.EmployeeClientLookup...` | AUTH | `AdminClientsContractTests.UnknownCustomers_Are404...` | 404 and auth -> added |
| ClientProfileController | `GET /api/client/profile` | `ClientProfileTests` | `ClientProfileTests` (403 admin, 401); AUTH | n/a | none |
| ClientProfileController | `PUT /api/client/profile` | `ClientProfileTests` | `ClientProfileTests`; AUTH | `ClientProfileTests`, `ClientProfileRulesTests` | none |
| CategoriesController | `GET /api/categories` | `CategoriesControllerTests` | n/a (anonymous) | n/a | none |
| DealsController | `GET /api/deals` | `CatalogEndpointContractTests.PublicDeals_ListsOnlyTheDealsRunningNow` | n/a (anonymous; `AuthorizationMatrixTests.PublicEndpoints_AnswerVisitors`) | n/a | success -> added |
| ProductsController | `GET /api/products` | `ProductsControllerTests`, `StockAvailabilityTests` | n/a (anonymous; tier price with token: `CustomerApprovalTests`) | n/a | none |
| ProductsController | `GET /api/products/{id}` | `StockAvailabilityTests`, `CustomerApprovalTests` | n/a | `CatalogEndpointContractTests.UnknownProductsAndCategories_Are404...` | 404 -> added |
| PublicStatsController | `GET /api/public/stats` | `PublicStatsTests` | n/a (anonymous) | n/a | none |
| PublicReviewsController | `GET /api/public/reviews` | `GoogleReviewsTests` | n/a (anonymous) | `GoogleReviewsTests` (provider failures) | none (not in section 7 table) |
| CoverageController | `POST /api/coverage/check` | `CoverageControllerTests`, `CoverageCheckResponseTests` | n/a (anonymous; throttled: `RateLimitingTests`) | `CoverageControllerTests` (bad input) | none |
| PublicContactController | `POST /api/public/contact` | `ContactMessagesTests` | n/a (anonymous; throttled: `ContactMessagesTests`) | `ContactMessagesTests` (400, honeypot) | none |
| AdminContactMessagesController | `GET /api/admin/contact-messages` | `ContactMessagesTests` | `ContactMessagesTests` (401, 403); AUTH | `ContactMessagesTests` (paging) | none |
| AdminContactMessagesController | `POST /api/admin/contact-messages/{id}/handle` | `ContactMessagesTests` | `ContactMessagesTests`; AUTH | `ContactMessagesTests` (404, 409) | none |
| AdminPendingActionsController | `GET /api/admin/pending-actions` | `PendingActionsTests` | `PendingActionsTests` (401, 403); AUTH | n/a | none |
| AdminAuditLogController | `GET /api/admin/audit-log` | `AuditLogPagingTests`, `AuditedMutationTests` | `PrincipalTests` (403); AUTH | `HttpInfrastructureTests` (bad paging 400) | 401 -> AUTH |
| AdminCategoriesController | `GET /api/admin/categories` | `CategoriesControllerTests` | `CategoriesControllerTests` (401, 403); AUTH | n/a | none |
| AdminCategoriesController | `GET /api/admin/categories/{id}` | `CategoriesControllerTests` | AUTH | `CategoriesControllerTests` (404 after delete), `CatalogEndpointContractTests` | none |
| AdminCategoriesController | `POST /api/admin/categories` | `CategoriesControllerTests` | `CategoriesControllerTests`; AUTH | `CategoriesControllerTests`, `AdminInputPolicyTests` | none |
| AdminCategoriesController | `PUT /api/admin/categories/{id}` | `CategoriesControllerTests` | AUTH | `CategoriesControllerTests` (404) | none |
| AdminCategoriesController | `DELETE /api/admin/categories/{id}` | `CategoriesControllerTests` | AUTH | `CategoriesControllerTests` (409), `CatalogEndpointContractTests` (404) | 404 -> added |
| AdminDealsController | `GET /api/admin/deals` | `CatalogEndpointContractTests.AdminDeals_ListAndGetById...` | AUTH | n/a | success, auth -> added |
| AdminDealsController | `GET /api/admin/deals/{id}` | `CatalogEndpointContractTests.AdminDeals_ListAndGetById...` | AUTH | same test (404) | success, 404, auth -> added |
| AdminDealsController | `POST /api/admin/deals` | `CatalogDataProtectionTests`, `AuditedMutationTests` | AUTH | `CatalogDataProtectionTests`, `AdminInputPolicyTests`, `CategoriesControllerTests` | auth -> AUTH |
| AdminDealsController | `PUT /api/admin/deals/{id}` | `CatalogDataProtectionTests`, `AuditedMutationTests` | AUTH | `CatalogDataProtectionTests`; `CatalogEndpointContractTests` (404) | 404, auth -> added |
| AdminDealsController | `DELETE /api/admin/deals/{id}` | `AuditedMutationTests`, `CatalogEndpointContractTests.AdminDeals_Delete...` | AUTH | `CatalogEndpointContractTests` (404) | 404, auth -> added |
| AdminPricingTiersController | `GET /api/admin/pricing-tiers` | `DefaultPricingTierTests` | AUTH | n/a | auth -> AUTH |
| AdminPricingTiersController | `POST /api/admin/pricing-tiers` | `DefaultPricingTierTests` | AUTH | `AdminInputPolicyTests`, `CatalogEndpointContractTests.PricingTiers_...` | auth -> AUTH |
| AdminPricingTiersController | `PUT /api/admin/pricing-tiers/{id}` | `DefaultPricingTierTests` | AUTH | `CatalogEndpointContractTests.PricingTiers_UpdateOfAnUnknownTier...` (404, 400), `DefaultPricingTierTests` | 404, 400, auth -> added |
| AdminProductsController | `GET /api/admin/products` | `ProductImportTests`, `PublicStatsTests` | AUTH | n/a | auth -> AUTH |
| AdminProductsController | `GET /api/admin/products/{id}` | `CatalogDataProtectionTests` | AUTH | `CatalogEndpointContractTests.UnknownProductsAndCategories_Are404...` | 404, auth -> added |
| AdminProductsController | `POST /api/admin/products` | `TestClients.CreateProductAsync`, `AuditedMutationTests` | AUTH | `CatalogDataProtectionTests`, `AdminInputPolicyTests`, `CategoriesControllerTests` | auth -> AUTH |
| AdminProductsController | `PUT /api/admin/products/{id}` | `AuditedMutationTests`, `ProductImportTests` | AUTH | `CatalogDataProtectionTests` (duplicate SKU) | auth -> AUTH |
| AdminProductsController | `DELETE /api/admin/products/{id}` | `CatalogDataProtectionTests` | AUTH | `CatalogDataProtectionTests` (409), `CatalogEndpointContractTests` (404) | 404, auth -> added |
| AdminProductImportController | `POST /api/admin/products/import` | `ProductImportTests` | `ProductImportTests` (403, 401); AUTH | `ProductImportTests` (empty form, bad rows) | none |
| AdminProductPricingController | `GET /api/admin/products/{id}/pricing` | `ProductImportTests`, `CatalogEndpointContractTests.ProductPricing_GetLists...` | AUTH | `CatalogEndpointContractTests.ProductPricing_RejectsUnknown...` (404) | 404, auth -> added |
| AdminProductPricingController | `PUT /api/admin/products/{id}/pricing` | `TestClients.CreatePricedProductAsync`, `AuditedMutationTests` | AUTH | `CatalogEndpointContractTests.ProductPricing_RejectsUnknown...` (404, 400 tier, price, qty) | validation, auth -> added |
| AdminProductPricingController | `DELETE /api/admin/products/{id}/pricing/{tier}/{minQty}` | `AuditedMutationTests` | AUTH | `CatalogEndpointContractTests.ProductPricing_RejectsUnknown...` (404) | 404, auth -> added |
| AdminWarehousesController | `GET /api/admin/warehouses` | `CoverageAdminEndpointContractTests.Warehouses_ListAndGetById...` | AUTH | n/a | success, auth -> added |
| AdminWarehousesController | `GET /api/admin/warehouses/{id}` | same | AUTH | same test (404) | success, 404, auth -> added |
| AdminWarehousesController | `POST /api/admin/warehouses` | `CoverageAdminValidationTests`, `AuditedMutationTests` | AUTH | `CoverageAdminValidationTests`, `AdminInputPolicyTests` | auth -> AUTH |
| AdminWarehousesController | `PUT /api/admin/warehouses/{id}` | `CoverageAdminEndpointContractTests.Warehouses_Update...` | AUTH | `CoverageAdminValidationTests` (400), `CoverageAdminEndpointContractTests` (404) | 404, auth -> added |
| AdminWarehousesController | `DELETE /api/admin/warehouses/{id}` | `CoverageAdminValidationTests` | AUTH | `CoverageAdminValidationTests` (409), `CoverageAdminEndpointContractTests` (404) | 404, auth -> added |
| AdminCoverageAreasController | `GET /api/admin/coverage-areas` | `CoverageAdminEndpointContractTests.CoverageAreas_ListAndGetById...` | AUTH | n/a | success, auth -> added |
| AdminCoverageAreasController | `GET /api/admin/coverage-areas/{id}` | same | AUTH | same test (404) | success, 404, auth -> added |
| AdminCoverageAreasController | `POST /api/admin/coverage-areas` | `CoverageAdminValidationTests`, `PublicStatsTests` | AUTH | `CoverageAdminValidationTests` | auth -> AUTH |
| AdminCoverageAreasController | `PUT /api/admin/coverage-areas/{id}` | `CoverageAdminValidationTests` | AUTH | `CoverageAdminValidationTests` (400), `CoverageAdminEndpointContractTests` (404) | 404, auth -> added |
| AdminCoverageAreasController | `DELETE /api/admin/coverage-areas/{id}` | `AuditedMutationTests`, `CoverageAdminEndpointContractTests.CoverageAreas_Delete...` | AUTH | `CoverageAdminEndpointContractTests` (404) | 404, auth -> added |
| AdminInventoryController | `PUT /api/admin/inventory` | `AdminInventoryContractTests.Upsert_CreatesThenUpdates...`, `EmployeeStockTests` | AUTH | `AdminInventoryContractTests.Upsert_Rejects...` (negative, unknown product, unknown warehouse) | validation, auth -> added |
| EmployeeInventoryController | `GET /api/employee/inventory` | `EmployeeStockTests`, `ProductImportTests` | AUTH | n/a | auth -> AUTH |
| QuotesController | `POST /api/quotes` | `QuoteFlowTests`, `BasketPricingTests` | `QuoteFlowTests`, `CustomerApprovalTests` (403 non-eligible); AUTH | `QuoteEndpointContractTests.CreateQuote_Rejects...` (empty, qty 0, unknown product) | validation -> added |
| QuotesController | `GET /api/quotes/mine` | `QuoteFlowTests`, `PrincipalTests` | `PrincipalTests` (403); AUTH | n/a | none |
| QuotesController | `POST /api/quotes/{id}/accept` | `QuoteFlowTests` | `PrincipalTests` (403 other client); AUTH | `QuoteFlowTests` (409), `QuoteEndpointContractTests` (404) | 404 -> added |
| QuotesController | `POST /api/quotes/{id}/reject` | `QuoteFlowTests` | `QuoteFlowTests` (403, 401); AUTH | `QuoteFlowTests`, `QuoteEndpointContractTests` (404) | none |
| EmployeeQuotesController | `GET /api/employee/quotes/queue` | `QuoteEndpointContractTests.Queue_ListsASubmittedQuote_ForStaff`, `PrincipalTests` | `PrincipalTests` (403); AUTH | n/a | success body, 401 -> added |
| EmployeeQuotesController | `GET /api/employee/quotes/history` | `QuoteHistoryTests` | `QuoteHistoryTests` (403, 401); AUTH | `QuoteHistoryTests` (filters, paging) | none |
| EmployeeQuotesController | `PUT /api/employee/quotes/{id}/price` | `QuoteFlowTests`, `BasketPricingTests` | AUTH | `QuoteFlowTests` (bad prices), `QuoteEndpointContractTests.PriceQuote_Rejects...` (400 empty, 404) | 404, empty list, auth -> added |
| OrdersController | `GET /api/orders/mine` | `PrincipalTests`, `BasketPricingTests`, `OrderEndpointContractTests` | `PrincipalTests`; AUTH | n/a | empty-list and auth -> added |
| EmployeeOrdersController | `POST /api/employee/orders` | `QuoteFlowTests`, `BasketPricingTests`, `OrderEndpointContractTests.PlaceOrder_Then...` | `CustomerApprovalTests` (403), `PrincipalTests`; AUTH | `OrderEndpointContractTests.PlaceOrder_Rejects...` (empty, qty 0, blank address, unknown client, unknown product), `QuoteFlowTests` | validation -> added |
| EmployeeOrdersController | `GET /api/employee/orders/history` | `OrderHistoryTests` | `OrderHistoryTests` (403, 401); AUTH | `OrderHistoryTests` (filters, paging) | none |
| Platform (`Program.cs`) | `GET /health` | `ContactMessagesTests`, `RateLimitingTests`, `AuthorizationMatrixTests.PublicEndpoints_AnswerVisitors` | n/a (anonymous) | n/a | none |

## Notes

- Drift guard: `AuthorizationMatrixTests.TheMatrix_ListsExactlyTheProtectedEndpointsTheAppExposes` reads the real routes from `EndpointDataSource` and fails, naming the route, if an endpoint that requires authorization (not `[AllowAnonymous]`, not `/health`) has no row in the matrix, or if a matrix row matches no real endpoint. Adding a protected endpoint without a matrix row fails the suite.
- For an allowed role the matrix requires a status that is not 401, not 403 and not 5xx (400/404/409/415 from the made-up ids or empty body are fine).

- Authorization is checked before model binding, so `AuthorizationMatrixTests` sends an empty JSON body (a multipart body for the import, which only accepts multipart) and made-up ids; only the status of the gate matters there.
- No production code was changed. Observation (not a bug, not logged as one): `POST /api/admin/products/import` answers a visitor who sends a non-multipart body with 415 before the 401, because the content type is matched before authorization. With a multipart body, the contract (401/403) holds and is tested.
