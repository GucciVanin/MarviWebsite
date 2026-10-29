# decisions

- 2026-10-29 Worker: `.stack` (components) stays the margin-based class used by 20 templates; the new gap-based form is `.stack--gap`, so no existing page changes. Pages move to it in 8.2 to 8.5.
- 2026-10-29 Worker: `.container` now reads `--gutter` and `--container-max` (1rem and 72rem, the old literal values): no visible change.
- 2026-10-29 Worker: the audit dismisses the privacy notice in most groups and leaves it visible in the `public-notice` group, so notice-related findings are reported once instead of on every page.
- 2026-10-29 Worker: `covered-text` ignores sticky/fixed layers passing over content mid-scroll (normal); it counts them only at rest on controls and fields.
- 2026-10-29 Worker: `form-column-width` exempts a block that shares its row with other fields, so a full-width field above a two-column row is not a violation.
- 2026-10-29 Worker: a Windows/Git Bash `git stash` was run and popped by mistake during the build check; no content was lost (git status identical before and after).
