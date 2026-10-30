# MRV-9.6 Customers choose the delivery address on quotes and orders

**Goal.** A customer with several addresses (MRV-9.3) picks where each quote and order is delivered; staff placing an order for a customer pick from that customer's addresses; the chosen address is kept on the document as it was at the time.

**Owner input (2026-10-30).** "Let customers pick which address to deliver, move forward with that."

**Evidence (Captain, 2026-10-30, code read).** `Quote` has no address. `QuoteWorkflowService.AcceptQuote` builds the order without one, so an order from an accepted quote has `DeliveryAddress = ""`. Only the employee-placed order (`CreateEmployeeOrderRequest.DeliveryAddress`) carries a free-text address that the employee types. Coverage is a separate check (`POST /api/coverage/check`, storefront) that takes free text and is not tied to the order.

**Decisions (Captain, reversible).**
- Depends on MRV-9.3 (address rows) and MRV-9.1 (numbers; no ids on screen). Delivery-capable addresses are those of kind `Delivery` or `Both`.
- The **document keeps a snapshot**, not a live reference: `Quote.DeliveryAddress*` and `Order.DeliveryAddress*` copy the structured fields (label, street, number, complement, district, city, state, CEP, notes) at the moment of choosing, plus a nullable `DeliveryAddressId` (set null if the address is later deleted). Editing or deleting an address never changes past quotes and orders.
- The customer chooses the address **when requesting the quote**, defaulting to their default delivery address, and may change it **until the quote is accepted** (while `Pending` or `Priced`); the order created on accept copies the quote's snapshot. An accepted quote's address cannot change (the customer contacts the company; staff may amend an order that is not yet shipped, audited).
- Employees placing an order choose from the customer's delivery addresses (the free-text field is removed); they may not invent an address for a customer.
- Coverage stays informational and optional: a "Verificar cobertura" button on the chosen address calls the existing check with the formatted address and shows the result; it never blocks the quote or order (warehouse assignment logic is unchanged).
- Existing quotes and orders get the legacy text in `DeliveryAddressText` and are shown with it; no structured data is invented for them.

## Acceptance criteria
- AC-1 Migration adds the snapshot columns and `DeliveryAddressId` (nullable, `ON DELETE SET NULL`) to `Quote` and `Order`, keeps `Order.DeliveryAddress` text for legacy rows, and has a `Down`; an API test runs it on legacy-shaped data.
- AC-2 `POST /api/client/quotes` takes `deliveryAddressKey` (the opaque address key from MRV-9.3); omitted means the default delivery address; a customer with no delivery-capable address gets 400 "Cadastre um endereço de entrega"; an address of another customer or an unknown key answers 404; the response carries the snapshot.
- AC-3 `PUT /api/client/quotes/{number}/delivery-address` (customer, own quote, status Pending or Priced) changes the snapshot; 409 once Accepted, Rejected or Cancelled; 404 for someone else's quote. Accepting copies the quote snapshot to the order (including `QuoteId` link), so an accepted-quote order never has an empty address.
- AC-4 `POST /api/employee/orders` takes `deliveryAddressKey` of the chosen customer instead of free text (kept accepted for one release only when the key is absent and the customer has no structured address: legacy fallback, logged) and refuses another customer's key.
- AC-5 Staff can amend the address of an order not yet shipped (`PUT /api/employee/orders/{number}/delivery-address`, audited with before/after); once shipped or delivered: 409.
- AC-6 Customer basket: an "Entregar em" selector listing the delivery addresses by label and one-line summary, the default preselected, a link to add an address (opens the profile) and a "Verificar cobertura" button with the result inline; the quote and order views show the address block with its label. No GUID or key is rendered.
- AC-7 Employee order form: the same selector filled from the loaded customer (widget and page of MRV-9.2 show it too); the orders history, customer page and both portals show the address of each document.
- AC-8 Changing or deleting an address after a quote or order was made leaves those documents unchanged (test proves it); deleting the billing address rules of MRV-9.3 still apply.
- AC-9 API tests: default, explicit, missing, foreign key, change while Priced, refusal after Accepted, employee choice, amend and refuse after shipped, snapshot immutability, 401/403; client tests for the selector, coverage button (success, failure, not blocking), the add-address link and the error states; runtime suite adds one quote with a chosen address on real Postgres using throwaway data; suites pass three times; layout audit and axe stay at zero with the selector open.
- AC-10 `docs/tests/coverage-map.md`, `project.md`, `architecture.md`, `CONTEXT.md` (**Delivery address snapshot**) updated.

## Out of scope
Per-line delivery addresses (split deliveries), scheduling a delivery window (Q4, deferred), freight cost by address, blocking orders outside the coverage area, address autocomplete, notifying the customer by e-mail of address changes.

## Open questions
None.
