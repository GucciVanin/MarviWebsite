# Marvi — Goal

*This document is the ultimate goal of the project. If any other document or piece of work
disagrees with it, this one wins. It is written for owners and decision makers, not engineers.*

## What Marvi is

Marvi is a single website that lets a wholesale distribution business run its day-to-day
selling online: customers find products and prices, ask for quotes and place orders, and the
business's own staff handle those requests from one place.

## Who it serves

- **Customers (businesses that buy in bulk).** They can browse what is for sale, see whether the
  company delivers to their address, create an account, ask for a price on what they need, accept
  the price they are offered, and follow their orders.
- **Employees.** They see the requests customers send in, set the final price, take orders over the
  phone or in person, look up stock levels, and review a customer's full history.
- **The owner / administrators.** They decide who works in the system, which customers are allowed
  to buy and on what terms, what is sold and at what price, which warehouses exist and which areas
  they serve, and they can see a record of every important change made.

## The problem it solves

Today a wholesale order depends on phone calls, emails and spreadsheets. Prices are quoted by hand,
stock is checked by asking someone, and nobody can easily see what happened to a request. Marvi
puts all of this in one place so that customers get answers faster and staff spend their time on
decisions instead of on re-typing information.

## What success looks like

1. A new customer can go from landing on the site to having a priced quote without talking to anyone.
2. A visitor learns within seconds whether the company delivers to them.
3. An employee can take a complete order for any customer in a few minutes, with correct prices and
   a reliable stock check.
4. The owner can see who did what, and can change products, prices, staff and delivery areas without
   asking a developer.
5. Prices are always calculated by the business's rules, never by what the customer's browser says.
6. Adding a new capability (or removing one the business no longer wants) is a small, contained
   change rather than a rebuild.

## Principles

- **One system, three audiences.** Customers, staff and the owner use the same platform, each seeing
  only what they are allowed to see.
- **The business controls the rules.** Pricing, discounts, delivery areas and access are settings the
  owner manages, not fixed behavior.
- **Start small, grow safely.** The first release serves one warehouse and one kind of delivery area.
  Multiple warehouses, invoices, returns, notifications and reports come later, in that order of value.
- **Build in pieces.** Every capability lives in its own self-contained piece so it can be improved,
  replaced or removed without disturbing the rest.

## What Marvi is not (for now)

It is not an online payment shop, an accounting system or a shipping/logistics tracker. Customers are
businesses that are quoted and invoiced, not consumers checking out with a card.
