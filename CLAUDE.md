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
