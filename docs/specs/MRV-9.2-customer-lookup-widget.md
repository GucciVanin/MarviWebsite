# MRV-9.2 "Consultar cliente" as a dynamic widget with a customer page

**Goal.** From a queued quote an employee (or admin) clicks "Consultar cliente", sees the customer's information in a pop-up widget right there, and from that widget opens the full customer page in a new tab.

**Evidence (Captain, 2026-10-30, code read).** Today "Consultar cliente" (`employee-portal.html:18`, `useCustomer`) loads the customer into the card at the bottom of the same page, far from the button, and there is no customer page to open. The same lookup is also reachable from the search box ("Selecionar").

**Decisions (Captain, reversible).**
- The widget is an accessible non-modal **popover/dialog** anchored to the button (native `<dialog>` or the Popover API; no new dependency). It is dynamic: it opens on click, loads the summary, shows a loading state then the data, closes on Escape, on the close button or on outside click, and returns focus to the button.
- The customer page is a new route `/employee/clientes/:number` (customer number from MRV-9.1; never the id). Admins reach the same page from the admin customers tab; the page lives under the employee area and is allowed for the Employee and Admin roles.
- "Open in a new tab" is a real link (`<a target="_blank" rel="noopener">`) so middle-click, copy link and keyboard work.
- The page shows the customer read-only plus the actions that already exist for staff (start an order for this customer when Approved). It does not edit the customer; the admin keeps editing in the admin customers tab.
- Same widget serves the search results' "Selecionar" action so there is one lookup path.

## Acceptance criteria
- AC-1 Clicking "Consultar cliente" on a queued quote opens the widget next to the button within one interaction, with `role="dialog"` (non-modal), a heading with the company name, `aria-labelledby`, and a busy state while loading.
- AC-2 The widget shows: company name, customer number, status badge, customer since, pricing tier, account type, CNPJ (formatted) and trade name for a business or masked CPF for a personal account (MRV-9.4), billing address and the delivery-address count (MRV-9.3), the contact e-mail, and the number of open quotes and orders. Missing values show "—", never an empty row.
- AC-3 The widget has a second control, "Abrir página do cliente", a link with `target="_blank"` and `rel="noopener noreferrer"` to `/employee/clientes/C-…`; it opens a new tab (verified by the `href`/`target` in a spec and once by eye in the browser).
- AC-4 Keyboard and screen reader: focus moves into the widget on open, Tab stays inside while it is open, Escape closes it and focus returns to the triggering button; closing by outside click does the same. Axe reports no violations for the open state at 375 and 1280 px.
- AC-5 Layout: the widget stays inside the viewport at 320 px and at 200% text, scrolls its own content when taller than the screen, never overlaps the header, the privacy notice or the WhatsApp button (layout audit extended with the open widget).
- AC-6 The page `/employee/clientes/:number` loads the customer by number (MRV-9.1), shows the full read-only detail (company, number, status, tier, registration data, all addresses, quotes and orders with their numbers), has a page title and a back link to the employee portal, and shows a clear "Cliente não encontrado" state for an unknown number (no raw error, no id).
- AC-7 Route guard: anonymous goes to login, a customer to their own portal; only Employee and Admin see the page. API enforces the same (existing 401/403).
- AC-8 Opening the widget twice for the same customer reuses the loaded profile for the session (no second request) and a failed load shows an alert with a retry button inside the widget.
- AC-9 Specs: widget open/close, focus return, loading and error states, link attributes, the page (success, 404), guard; employee-portal spec updated; client suite three times green; layout audit and axe extended and at zero.

## Out of scope
Editing a customer from the page, a customer timeline, printing, a map, opening the page for customers themselves (they have `/portal`).

## Open questions
None.
