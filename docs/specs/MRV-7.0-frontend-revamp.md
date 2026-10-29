# MRV-7 Front-end revamp: modern look, icons, motion (public site)

**Goal.** The public site feels modern and responsive to touch and click: every interaction has a recognisable icon, and moving between pages and acting on controls is smooth, never abrupt. The brand (navy / gold / red, the "M" badge, pt-BR copy) stays.

**Decisions (from the owner, 2026-10-29).** Icon set: Lucide via `@lucide/angular` (the older `lucide-angular` stops at Angular 21; this project is on 22). Scope: public site first (header, footer, home, storefront, contact, privacy, login, register, shared components); the three portals follow in a second pass using the same system. Direction: keep the brand, modernise the typography, spacing, depth and illustration.

**Decisions (Captain, reversible).** Page transitions use the browser View Transitions API through Angular's `withViewTransitions()`, so unsupported browsers simply navigate without animation. No animation library. Fonts self-hosted (no request to Google; the privacy policy says visitors never contact third parties). Art is inline SVG / CSS (gradients, shapes), no stock photos, so there are no licences or large images to ship. Only the icons that are used are bundled.

Slices MRV-7.1 to 7.4 (one commit each, in this order):

## 7.1 Design foundation and icon system
- AC-1 One self-hosted variable font (woff2, licence OFL/compatible, recorded in `docs/`) replaces the system stack for headings and body; text stays readable if the file fails to load (fallback stack, `font-display: swap`).
- AC-2 `_tokens.scss` gains a type scale, elevation (shadows), radius, gradient and motion-easing tokens; existing tokens keep their names so portals are not visually broken.
- AC-3 An `<app-icon name="...">` component renders a Lucide icon from a typed name map in one file; unknown names fail to compile; icons are decorative (`aria-hidden`) unless an `label` input is given, then `role="img"` with that label.
- AC-4 Buttons, links, cards, form fields, badges and alerts in `_components.scss` get modern states: hover, `:active` press, focus ring (keyboard), disabled, and an optional leading/trailing icon slot.
- AC-5 The production bundle grows by no more than 60 kB gzipped for this slice (recorded in the report); all existing tests still pass.

## 7.2 Icons on every public interaction
- AC-6 Header: icon on each nav link, the menu toggle (menu / close), login and account actions, cart/quote entry where present.
- AC-7 Footer: icons for address, phone, WhatsApp, e-mail, social links, privacy and contact links (existing inline SVGs replaced by the icon component).
- AC-8 Buttons that act (send, add to quote, request, filter, search, handled, retry, accept notice, WhatsApp) carry an icon; icon-only buttons have an accessible name.
- AC-9 Form fields on contact, login and register show a leading icon (user, mail, phone, building, message, lock) and inline validation/state icons (error, success).
- AC-10 Alerts, empty states and load states use icons (info, warning, error, success, empty box, spinner).
- AC-11 Home sections (network, about, why us, reviews) use icon marks instead of text-only bullets.
- AC-12 No new 4xx/5xx or console errors on any public route; component specs assert the icon names and accessible names.

## 7.3 Motion: page transitions and click feedback
- AC-13 Navigating between public routes cross-fades / slides content with a View Transition (~250–300 ms) while header and footer stay still; navigation works identically when the API is unsupported.
- AC-14 Fragment links on the home page (`#rede`, `#sobre`, `#por-que`) scroll smoothly and land below the sticky header.
- AC-15 Interactive elements respond: hover lift, press scale, focus ring, menu open/close slide, notice enter/exit; all use the motion tokens.
- AC-16 Lists and sections reveal on scroll (fade/rise, once, staggered) via a directive using `IntersectionObserver`; content is fully visible without JavaScript APIs or when intersection is unsupported.
- AC-17 Loading uses skeleton placeholders instead of bare text on storefront and reviews.
- AC-18 `prefers-reduced-motion: reduce` disables every transition, reveal and transform animation (tokens go to 0 ms, view transition skipped); a spec covers the directive and the reduced-motion path.
- AC-19 Animations only use `transform` and `opacity`; no layout shift is introduced (CLS stays at 0 on the home page in the browser check).

## 7.4 Layout and art refresh of public pages
- AC-20 Home: new hero (brand gradient, SVG shapes, existing ribbons island kept and still optional), section rhythm and cards in the new system.
- AC-21 Storefront: product cards, filters and category chips redesigned; quote action prominent; keyboard operable.
- AC-22 Contact, privacy, login and register use the new form and layout components.
- AC-23 Checked at 375, 768 and 1280 px with no horizontal scroll; text contrast meets WCAG AA (4.5:1) for body text; verified in the browser and recorded.
- AC-24 Lighthouse (desktop and mobile) accessibility ≥ 95 on home and storefront; performance score is recorded, not gated.

## Out of scope
Admin, employee and client portals (second pass), dark theme, new copy or new features, photography, animation libraries, the animated hero island's own internals, i18n.

## Open questions
None blocking. Resolved by the owner: icon set, scope, direction.
