# MRV-2.9 SEO basics — issue #38

**Goal.** Public pages are findable and shareable; private portals are kept out of search engines.

**Decisions (Captain, reversible).** No `sitemap.xml` yet: it needs the production domain, which is unknown (listed in the report). Structured data is built at runtime so placeholders never leak into it. Per-category titles are out of scope (categories are a query filter, not routes).

## Acceptance criteria
- AC-1 A `TitleStrategy` sets every route's `<title>` to "<page> | MARVI" (home: "MARVI | Exímia Distribuidora de Bebidas"); every route has a pt-BR page title.
- AC-2 Public routes (home, storefront, contato, privacidade, login, register) set a `<meta name="description">` of 50–160 characters from one pt-BR file.
- AC-3 `index.html` carries `lang="pt-BR"`, `og:title`, `og:description`, `og:type`, `og:locale` and `twitter:card`, generated from the same strings.
- AC-4 A `LocalBusiness` JSON-LD block (`application/ld+json`) is added at runtime with name, `url` (site origin), `sameAs` (Facebook, Instagram) and `telephone`/`email`/`address` **only** when those are not placeholders.
- AC-5 Private routes (`/admin`, `/employee`, `/portal`, login, register) set `<meta name="robots" content="noindex">`; public pages remove it.
- AC-6 `robots.txt` is served at `/robots.txt` allowing public pages and disallowing `/admin`, `/employee`, `/portal`; the nginx config and CSP still pass (`script-src 'self'` unaffected by JSON-LD).
- AC-7 Specs cover the title strategy, meta tags, structured-data content with and without placeholders, and noindex toggling.

## Out of scope
sitemap.xml, per-category pages, Lighthouse measurement, hreflang.
