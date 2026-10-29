# MRV-2.8 Contact form with admin inbox — issue #37

**Goal.** A visitor can write to the business from the site; the admin sees it in the Pendências inbox and marks it handled. No e-mail is sent (no provider chosen).

**Decisions (Captain, reversible).** Stored in the database; surfaced as a fifth pending-actions group; handled messages leave the inbox but stay stored. Spam control: honeypot field + per-IP rate limit; no CAPTCHA.

Slices: 2.8a API, 2.8b contact page, 2.8c admin inbox group (one commit each).

## 2.8a API
- AC-1 `POST /api/public/contact` (anonymous) accepts `name` (required, ≤100), `email` (required, valid, ≤200), `phone` (optional, ≤30), `company` (optional, ≤150), `message` (required, 10–2000 characters after trimming) and answers 204; the message is stored with UTC `CreatedAt` and no handled date.
- AC-2 Invalid input answers 400 with field problems and stores nothing.
- AC-3 A non-empty honeypot field `website` answers 204 and stores nothing.
- AC-4 A new rate-limit policy `contact` allows 5 requests per 60 s per client address (configurable `RateLimiting:Contact:*`), 429 + `Retry-After`; test factory keeps generous limits; compose sets a high limit for dev.
- AC-5 `GET /api/admin/contact-messages?handled=false&page=&pageSize=` (Admin only) lists newest first with total count; 401 anonymous, 403 for other roles.
- AC-6 `POST /api/admin/contact-messages/{id}/handle` (Admin) sets `HandledAt`, is audited, 404 unknown id, 409 when already handled.
- AC-7 `GET /api/admin/pending-actions` gains a `contactMessages` group (count of unhandled, ≤50 newest-first items, included in `Total`).
- AC-8 EF migration adds the table; runtime suite gains checks on real Postgres (anonymous submit works, invalid refused, admin-only listing).

## 2.8b Contact page
- AC-9 `/contato` shows the form (labels, pt-BR validation messages, disables submit while sending), a success confirmation that clears the form, and an error alert on failure (429 explained).
- AC-10 The honeypot input is hidden from people and assistive tech (`aria-hidden`, `tabindex=-1`, off-screen).
- AC-11 Header and footer link to `/contato`; the page shows the footer contact details placeholders as plain text.

## 2.8c Admin inbox
- AC-12 The admin inbox lists "Mensagens de contato" with name, e-mail (mailto link), phone, company, message and date; "Marcar como atendida" removes it at once and refreshes the tab count; empty group says so.

## Out of scope
E-mail/SMS notifications, replying from the app, attachments, CAPTCHA, deleting messages.
