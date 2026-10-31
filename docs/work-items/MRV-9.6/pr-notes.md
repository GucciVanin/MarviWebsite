# MRV-9.6 PR notes (owner-facing)

**Customers choose where each quote and order is delivered.**

- **Customer basket**: a new "Entregar em" selector lists the customer's delivery addresses (by label and address), with the default one already chosen and the chosen one written out below. "Verificar cobertura" tells whether we serve that address (information only: it never blocks the quote). If the customer has no delivery address, the page says so and "Cadastrar ou completar endereço" opens the add-address form in "Meus dados". "Solicitar cotação" needs an address.
- **Quotes**: each quote shows where it goes. Until it is accepted (waiting for a price or priced) the customer can use "Alterar endereço de entrega". After accepting or refusing, the address is fixed.
- **Orders**: an order made from an accepted quote carries that quote's address. Orders and quotes keep a copy of the address as it was: editing or removing the address later changes nothing already made. Old orders show their old text; old quotes show "Endereço a confirmar".
- **Staff**: the order form no longer has a free-text address; staff choose among the loaded customer's delivery addresses (default chosen). The queue, the history, the customer page and the placed order show each document's address; "Consultar cliente" shows the default delivery address. Staff can amend an unshipped order's address through the API (audited with before and after); there is no screen for it yet.
- **Rules to know**: a billing-only address cannot be a delivery address; an address still marked "a completar" can be chosen; a customer migrated without a default or billing address gets a clear message, not an error. Free text for an order is still accepted by the API only for a customer with no saved address at all (logged).
- **API additions/changes**: `deliveryAddressKey` on `POST /api/quotes` and `POST /api/employee/orders`; new `PUT /api/quotes/{number}/delivery-address` and `PUT /api/employee/orders/{number}/delivery-address`; quote and order JSON carry `deliveryAddressSnapshot`. `CreateEmployeeOrderRequest.deliveryAddress` is now optional.
- **Database**: migration `DeliveryAddressSnapshot` (ten nullable columns on quotes and orders; no data changed). Production needs no manual step.
- **Demo data** (`deploy/seed-demo.mjs`): quotes and an employee order now carry delivery addresses.
- **Quotes from before this change** have no address: a customer must choose one ("Aceitar cotação" opens the picker) before accepting, so an order never has an empty address.
- **Coverage check privacy**: the selector and the privacy page (still a draft) say the address goes to a map provider when "Verificar cobertura" is used.
- **Free text limits**: the legacy free-text address of a staff order is limited to 500 characters without line breaks or control characters; migration `OrderDeliveryAddressMaxLength` limits the column and cuts any longer old text.
- **Known gaps**: a real concurrent accept-versus-change race is only covered by the 409 logic, not a Postgres test; the staff amend has no SPA control; the order has no concurrency token (an amend can race a fulfil).
