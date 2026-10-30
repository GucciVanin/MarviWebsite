# Marvi

A wholesale distributor's online platform where businesses get priced quotes and place orders, and staff handle those requests.

## Language

**Customer**:
A business that buys in bulk from the distributor. Appears in code as `Client` (`ClientAccount`, the `Client` role, `/api/client/*`, the `client_id` claim); that is an implementation name, not a second concept.
_Avoid_: Client (in prose), buyer, account

**Customer eligibility**:
Whether a Customer may request a quote, accept one, or have an order placed for them. Only an Approved Customer is eligible; Pending and Suspended Customers are not.
_Avoid_: Permission, access

**Approval**:
An Admin's explicit decision to let a Customer transact, choosing their pricing tier. A newly registered Customer is Pending (least privilege: no access to quotes and orders until approved); a Suspended Customer is approved again the same way. Nobody is approved by default.
_Avoid_: Activation, verification

**No credit**:
A Customer has no credit limit and no balance owed. Every purchase is a direct transaction: they pay or they do not. There is no credit concept anywhere in the product.
_Avoid_: Credit limit, credit line, limit

**Basket**:
A set of products and quantities priced together for one Customer; it becomes either a Quote or an Order.
_Avoid_: Cart, request, line items (as a whole)

**Quote**:
A Customer's request for a price on a Basket. It is priced by the system, finalised by an Employee, and accepted by the Customer.
_Avoid_: Estimate, proposal

**Order**:
A confirmed purchase of a Basket, created by a Customer accepting a Quote or by an Employee placing it directly.
_Avoid_: Purchase, transaction

**Customer number**:
A short business reference for a Customer (`Número do cliente`, shown as `C-000042`): a sequence the database assigns once at registration, unique, never reused and never edited. Staff read it out and the Customer sees it on their own profile. It is not the Customer's id: the id (a GUID) is for the backend and no screen, URL, title or label ever shows it. The SPA formats the number in one pipe.
_Avoid_: Client ID, customer id, account number

**Address**:
A named place of a Customer in the Brazilian structure (`Endereço`): label (apelido, e.g. "Matriz"), kind (Billing, Delivery or Both), CEP, street, number, complement, district, city, UF, delivery notes. A Customer keeps up to 20 on one account. In the API it is `ClientAddress`, found by an opaque key, never by its id, and no screen shows either. Legacy free-text addresses become Addresses flagged "needs review".
_Avoid_: Location, site

**Billing address**:
The one Address of a Customer that invoices go to (`Endereço principal`, shown with the badge "Principal"). Exactly one; it can only be moved by choosing another, never removed.
_Avoid_: Main address, invoice address

**Delivery address**:
An Address goods are delivered to (kind Delivery or Both). One of them is the Customer's default delivery address (`Entrega padrão`). Choosing one per quote or order is a later story (MRV-9.6).
_Avoid_: Shipping address

**Quote number / Order number**:
The same kind of reference for a Quote (`Q-000123`) and an Order (`P-000045`), each from its own sequence. Pages that show a document name it by its number, never by its id.
_Avoid_: Quote id, order id, reference

**Pricing tier**:
A named price list a Customer is assigned to; exactly one is the default, used for anonymous visitors and new Customers.
_Avoid_: Price group, level

**Deal**:
A time-limited discount on chosen products or categories, applied on top of a tier price.
_Avoid_: Promotion, coupon
