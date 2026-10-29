# MRV-2.7 Cookie notice and privacy page (LGPD) — issue #36

**Goal.** Visitors are told what the site stores and can read a privacy policy; the site stays honest about what it does.

**Facts the spec relies on.** The site sets no cookies and has no analytics or ad trackers. The only browser storage is the login token (`localStorage`, strictly necessary). Visitors never contact Google (reviews are fetched server-side). So the notice is informational with a single "Entendi" button, not a consent wall with categories. If analytics are added later this spec must be extended.

**Decisions (Captain, reversible, no open questions).** Notice is informational, not consent-gated. The policy text is a **draft in pt-BR for legal review**; the company's legal name/CNPJ come from placeholders in `core/contact/contact-info.ts` style config, never invented.

## Acceptance criteria
- AC-1 On a first visit to any page the app shows a notice (`role="region"`, label "Aviso de privacidade") fixed at the bottom, in pt-BR, saying what is stored and linking to `/privacidade`.
- AC-2 The "Entendi" button hides the notice and stores the dismissal in `localStorage` (key `marvi.privacy-notice`).
- AC-3 With the dismissal stored the notice is not shown on later loads.
- AC-4 If `localStorage` throws on read or write, the app renders without error; the notice shows (read failure) and dismisses for the session (write failure).
- AC-5 `/privacidade` is a public route with a page title and headings for: who is responsible, data collected (account/registration, quotes and orders, contact form), purpose, rights under LGPD art. 18 and how to exercise them, storage on the device (login token, this notice), third parties (Google reviews content), and last-updated date.
- AC-6 Contact details on the policy come from `CONTACT_INFO` and show as plain placeholder text while unset (no dead links).
- AC-7 The footer and the register page link to `/privacidade`.
- AC-8 The notice is keyboard operable, does not trap focus and does not cover the WhatsApp button (stacks above it).

## Out of scope
Cookie categories, consent logs, analytics opt-in, legal sign-off (owner/lawyer).
