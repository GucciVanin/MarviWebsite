## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (GucciVanin/MarviWebsite) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Git workflow

- `dev` is the agent's development branch; `main` is the protected integration branch. Work, commit and push on `dev`.
- Commit and push to `origin`/`PersonalWebsite` `dev` yourself; no need to ask first.
- **One commit per user story** (an `MRV-<n>.<m>` row in `project.md`, e.g. `MRV-4.3`), and **one PR from `dev` to `main` per feature**: the backlog stories that belong to the same feature area (the Sprint 2b grouping is in `project.md`; otherwise the feature folders in architecture.md: Identity, Catalog, Coverage, Quotes, Orders, Inventory, Auditing, or the SPA).
- Each story commit is self-contained: its tests, its code and the `project.md`/`architecture.md` updates the Definition of Done requires, and it names its issue (`Closes #n`). Review fixes go in follow-up commits that name the story.
- Keep each PR compact and verifiable: only that feature's stories. The PR description lists which stories it carries and how each was verified (tests, runtime suite).
- **Never merge a PR.** Open it and leave it for the owner's review. Don't enable auto-merge.
- Start the next feature only from an up-to-date `dev` (merge `main` into `dev` after the owner merges a PR). While a feature PR is open, further stories of that same feature go on `dev` and join that PR; stories of a different feature wait for the merge.
- Use the `gh` CLI for PRs (see `docs/agents/issue-tracker.md`). If `gh` isn't on `PATH` in the shell, use `C:\Program Files\GitHub CLI\gh.exe`.

## Local stack and ports

- This project's docker compose stack (`deploy/docker-compose.yml`, compose project `deploy`) is the agent's to manage: **4200** is the SPA (nginx) and **8080** is the API. Anything you find on those ports is this project's stack, not someone else's.
- `test/runtime/run.sh` refuses to start while 8080 is taken. Before running it: `docker compose -f deploy/docker-compose.yml down` (never `-v`, which would delete the dev database). The suite uses its own compose project (`marvi-runtime`) and tears it down when finished. Afterwards restore the dev stack: `docker compose -f deploy/docker-compose.yml up -d --build`.
- Always put the stack back the way you found it, and say in the PR whether the runtime suite was run.
