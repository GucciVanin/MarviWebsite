# Customer is the domain term; `Client` stays in code

The domain language says **Customer** (as in `goal.md`), but the code, API routes, roles and the `client_id` claim all say `Client`. We keep the code identifiers unchanged because renaming would alter public routes, token claims and the database, which conflicts with the rule that refactors must not change working behaviour. Specs and docs use "Customer" in prose and `Client…` for identifiers. Do not propose a rename in architecture reviews unless the owner reopens this.
