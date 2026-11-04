# MRV-9.7 security report (product photo upload and serving)

Verdict: **PASS** (no Critical, High or Medium findings; 2 Low, 4 Informational). Static review of the uncommitted diff and untracked files; nothing was executed.

## Checked and found sound

- **Upload authz.** `ProductPhotosController` is `[Authorize(Roles = "Admin")]`. Authorization runs before the resource filter and the action, so anonymous (401) and customer/employee (403) requests never reach the body reader. Auth is JWT bearer, so a cross-site multipart POST (CSRF) is not possible. The runtime suite asserts 401/403/403.
- **Parser (`ProductPhotoRules`).**
  - Magic bytes decide the type. The extension and the client content type are never used.
  - JPEG: segment lengths are bounds-checked, SOF2+ and arithmetic frames are refused, a second SOI or a stray 00 is refused, and the file must end exactly at EOI.
  - PNG: chunk length is `uint` checked against `int.MaxValue` and the file length in `long`. CRC is verified, IHDR must be first with length 13, IDAT is required, and IEND must be last and exactly at EOF.
  - WebP: the RIFF size must equal the file length. Chunk sizes are checked in `long` arithmetic. The chunks must tile the file, animated files are refused, and a VP8 keyframe start code is required.
  - All casts to `int` happen after bounds checks, so I found no overflow.
  - Dimensions are limited to 400..6000. Truncated and oversize files are refused (5 MB file, 6 MB request).
  - SVG and GIF fail the magic check. Trailing data (ZIP or other) fails the exact-end checks.
  - Metadata is searched for markup markers. Accepted limit (decisions.md): markup inside compressed pixel data is not detected. The serving headers neutralise it.
- **Body caps.**
  - API: `RequestSizeLimit` of 6 MB, `MultipartBodyLengthLimit` of 6 MB, `ValueCountLimit` of 8, and an early `Content-Length` check that answers 413.
  - nginx: `client_max_body_size 6m` only in `location = /api/admin/media/product-photos`. The `/api/` location and the SPA keep the 1 MB default, and the CSP is unchanged.
  - Memory is bounded at about 6 MB per request, with 30 requests per minute per IP.
- **Rate limit and pending cap.** The `productPhoto` policy applies. At most 50 waiting uploads per admin gives 429. Disk growth is bounded: about 250 MB per admin per hour in the worst case, plus one 5 MB photo per product. Replacing, removing or deleting a product deletes the file, and the cleanup removes orphans.
- **Tokens.**
  - A token is 128 random bits from `RandomNumberGenerator`.
  - It is bound to the uploader's user id and expires after 1 hour, checked on use and by the cleanup.
  - Unknown, expired, malformed and other-admin tokens all give one generic message.
  - Spending removes the row in the same audited save as the product, so the token is single use.
  - Two requests racing on one token: the loser's `DELETE` affects 0 rows, which raises a concurrency exception and maps to a 400 on `photo`.
  - A failed product save leaves the token and the file untouched.
- **GET path and name validation.**
  - The name must match `^[0-9a-f]{32}\.(jpg|png|webp)$` before any file system call. `PathOf` re-validates and re-checks the resolved path against the root.
  - Encoded, backslash, absolute, long and unicode names (`.` `/` `\` `%` and unicode are not in the character class) fail the pattern and give 404.
  - Only the app writes the folder, and names are random, so there are no symlinks to follow.
- **Response headers.** `nosniff`, a content type derived from the stored extension (which equals the detected type), `default-src 'none'; sandbox`, and `public, max-age=31536000, immutable`. The nginx `^~` location lets the API cache headers through, and the server-level security headers still apply there.
- **Storage.** `/media` is created and owned by the app user (non-root) in the Dockerfile. Writes go to a temp file and then a move with `overwrite: false`. The Production guard refuses to start without `Media:Path`.
- **Cleanup worker.** It deletes only names that pass `IsStoredName` and `.*.tmp` files inside the media root. Rows are deleted first and files only for the rows really removed. There is a 10 minute grace past the 1 hour lifetime. Linked files are protected by the used-set. Failures are logged without the file content. In the Testing environment the worker is not registered.
- **Failed saves and orphans.** If the DB insert fails after the file is written, the file is deleted. A crash between the two leaves an orphan that the cleanup removes after the grace period.
- **Migration.** It clears `image_url` except paths of ours (the `LIKE` pattern has no extra wildcards), and Down drops only the table. This is documented.
- **SPA.**
  - `app-product-photo` draws only paths starting with `/api/public/media/products/`, so an external address is never requested.
  - There is no `innerHTML`, `bypassSecurity*` or `[srcset]` anywhere in app code.
  - Alt text comes from Angular-escaped bindings, and a failed load falls back to the placeholder.
  - The preview is the server's same-origin URL (no `blob:`), and the CSP is untouched.
- **Audit and errors.** The product save audit records the relative photo path only. Messages are fixed pt-BR strings and never echo the file name, type or content.
- **`test/layout/rules.mjs`.** The new line skips only descendants of a *closed* `<details>`, and not the `<summary>`. Open details, visible content and everything outside details still go through every rule. The `<details>` element itself is not skipped, because the test uses `parentElement.closest`. Content of a closed details is not rendered or focusable, so nothing real is hidden. Edge: a second `<summary>` in one details would be skipped, but that is invalid HTML.
- **Decorative `alt=""` thumbnails.** All of them sit in `.photo-cell` next to the product name as text, so there is no unnamed link or button. This follows WCAG H67, and the name is exposed through the adjacent text. The card and the admin table keep the name as alt. This is acceptable and is the decision recorded in decisions.md.

## Findings

| # | Sev | Location | Risk | Fix |
|---|-----|----------|------|-----|
| 1 | Low | `ProductPhotoRules.cs` `TokenShape()` and `FileNameShape()` (`^...$`) | In .NET `$` also matches before a final `\n`, so `"<32hex>\n"` and `"<32hex>.jpg\n"` pass `IsToken` and `IsStoredName`. I found no exploit: Postgres equality rejects the token, `File.Exists` is false for the name, and `Delete` is a no-op. It is still a validator that is looser than its documentation, and the traversal tests do not cover a trailing LF. | Use `\z` (or `RegexOptions.NonBacktracking` with `\z`) in both patterns, and add a `...%0A` case to the traversal set. |
| 2 | Low | `ParsePng` and `ParseWebp` | The bytes are not decoded, so the claims are only partly cross-checked. A PNG IHDR does not check bit depth, colour type or interlace, and a second IHDR is ignored. A deflate stream in IDAT can inflate far beyond what 6000 x 6000 allows. WebP VP8/VP8L dimensions are ignored when a VP8X canvas exists, so the two can disagree. The server never inflates, so there is no server DoS. The risk is a browser decoding a hostile or 36 MP image: admin-only upload, and browsers reject mismatches. | Accepted for this story. Optionally require VP8X canvas dimensions to equal the VP8/VP8L dimensions, reject duplicate IHDR, and validate the IHDR fields. Consider a pixel budget below 6000 x 6000 (no server-side resize exists). |
| 3 | Info | `deploy/nginx.conf` upload location | `proxy_request_buffering` is on, so an unauthenticated client can make nginx buffer up to 6 MB before the API answers 401. The per-IP rate limit sits before authentication in the pipeline, so anonymous traffic from an admin's IP can consume that admin's 30 per minute. | Existing pattern for all rate-limited routes. Optionally add `limit_req` on this nginx location, or `auth_request`. |
| 4 | Info | Serving headers | `public, immutable` for a year means a photo that was removed stays in browser and CDN caches. EXIF is not stripped (documented). | Accepted and documented. Strip EXIF as the logged follow-up. |
| 5 | Info | `ProductPhotoService.CleanupAsync` | It deletes every stored-name file older than 70 minutes that no product or upload refers to. Restoring a database backup older than the volume, or pointing `Media:Path` at the wrong volume, would delete the unreferenced photos permanently. | Operational: the docs already say to back up and restore both together. Optionally add a guard such as skipping the file sweep when the products table has no `image_url` rows but the folder has many files. |
| 6 | Info | `ProductPhotosController.Upload` | The pending-cap check is count-then-insert, so parallel uploads can exceed 50 slightly. The rate limit bounds this. | None needed. |

## Not verified

I ran no tests, no stack and no docker commands. I read `ProductPhotoTests.cs` and `api-security.mjs` only as far as grep (coverage lines for roles, traversal, polyglot, SVG, GIF, oversize, token race, and cleanup are present). The 413-over-a-socket behaviour and the Postgres concurrency race rely on the runtime suite results.
