# Fonts

| | |
|---|---|
| Family | Inter Variable (weights 100 to 900, one file per subset) |
| Designer | Rasmus Andersson (rsms) |
| Source | npm package `@fontsource-variable/inter` 5.3.0 (https://fontsource.org/fonts/inter), files `inter-latin-wght-normal.woff2` and `inter-latin-ext-wght-normal.woff2` copied unmodified |
| Licence | SIL Open Font License 1.1 (text in `client/public/fonts/LICENSE-Inter.txt`); free to use, embed and redistribute with the site |
| Location | `client/public/fonts/` (served same-origin at `/fonts/...`); `@font-face` in `client/src/styles/_fonts.scss` |
| Subsets | latin (about 48 kB) and latin-ext (about 85 kB). Together they cover Portuguese (pt-BR) accents and cedilla. The browser downloads a file only when the page contains a character in its `unicode-range`; Portuguese text normally needs just the latin file. |
| Loading | `font-display: swap`; the fallback stack stays in `--font-sans` (`'Segoe UI', system-ui, ...`), so text shows at once and stays readable if the file fails |
| Privacy / CSP | No request to Google or any CDN. `font-src 'self'` in `deploy/nginx.conf` already allows the files; no change was needed. |

To update: install the package in a scratch directory, copy the two woff2 files and the LICENSE over the ones above, and update the version in this file and in `_fonts.scss`.
