## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (GucciVanin/PersonalWebsite) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Git workflow

- `dev` is the agent's development branch; `main` is the protected integration branch. Work, commit and push on `dev`.
- Commit and push to `origin`/`PersonalWebsite` `dev` yourself; no need to ask first.
- Open **one PR from `dev` to `main` per user story** (e.g. `MRV-2.4a`; IDs are in `project.md`). Keep each PR compact and verifiable: only that story's changes, with tests, plus the `project.md`/`architecture.md` updates the Definition of Done requires.
- **Never merge a PR.** Open it and leave it for the owner's review. Don't enable auto-merge.
- Start the next story only from an up-to-date `dev` (merge `main` into `dev` after the owner merges a PR).
- Use the `gh` CLI for PRs (see `docs/agents/issue-tracker.md`). If `gh` isn't on `PATH` in the shell, use `C:\Program Files\GitHub CLI\gh.exe`.

## Local stack and ports

- This project's docker compose stack (`deploy/docker-compose.yml`, compose project `deploy`) is the agent's to manage: **4200** is the SPA (nginx) and **8080** is the API. Anything you find on those ports is this project's stack, not someone else's.
- `test/runtime/run.sh` refuses to start while 8080 is taken. Before running it: `docker compose -f deploy/docker-compose.yml down` (never `-v`, which would delete the dev database). The suite uses its own compose project (`marvi-runtime`) and tears it down when finished. Afterwards restore the dev stack: `docker compose -f deploy/docker-compose.yml up -d --build`.
- Always put the stack back the way you found it, and say in the PR whether the runtime suite was run.
