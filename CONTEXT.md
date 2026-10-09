# Marvi

A wholesale distributor's online platform where businesses get priced quotes and place orders, and staff handle those requests.

## Language

**Customer**:
A business that buys in bulk from the distributor. Appears in code as `Client` (`ClientAccount`, the `Client` role, `/api/client/*`, the `client_id` claim); that is an implementation name, not a second concept.
_Avoid_: Client (in prose), buyer, account

**Customer eligibility**:
Whether a Customer may request a quote, accept one, or have an order placed for them. Only an Approved Customer is eligible; Pending and Suspended Customers are not.
_Avoid_: Permission, access

**Basket**:
A set of products and quantities priced together for one Customer; it becomes either a Quote or an Order.
_Avoid_: Cart, request, line items (as a whole)

**Quote**:
A Customer's request for a price on a Basket. It is priced by the system, finalised by an Employee, and accepted by the Customer.
_Avoid_: Estimate, proposal

**Order**:
A confirmed purchase of a Basket, created by a Customer accepting a Quote or by an Employee placing it directly.
_Avoid_: Purchase, transaction

**Pricing tier**:
A named price list a Customer is assigned to; exactly one is the default, used for anonymous visitors and new Customers.
_Avoid_: Price group, level

**Deal**:
A time-limited discount on chosen products or categories, applied on top of a tier price.
_Avoid_: Promotion, coupon
