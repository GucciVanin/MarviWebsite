# Runtime tests

`api-security.mjs` seeds realistic dummy data through the real API (tiers, categories, warehouses, products with
quantity-break prices, deals, stock, employees, clients), then checks against a live Postgres:

- **Retrieval accuracy:** prices per tier and quantity break, deal discounts (best wins, expired/future/minimum-quantity
  ignored), stock flags, search/category filters, quote/order totals.
- **Security:** every endpoint x every role (anonymous, client, employee, admin), cross-client access, forged/expired
  tokens, mass assignment on registration, SQL-injection and hostile-text inputs, malformed bodies, CORS.
- **Database:** no plaintext passwords, history cannot be deleted (foreign keys refuse it), duplicate SKUs/categories
  refused by the database itself, order totals equal their lines, audit trail complete and password-free.

```bash
bash test/runtime/run.sh        # rebuilds the stack on an empty database, runs the checks, tears it down
```

It needs a fresh database each time (fixed e-mail addresses). The Chrome-driven UI run is not kept in the repo: it needs
a local Chrome and `puppeteer-core`.
