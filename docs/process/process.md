# The process (copy of the /start-dev workflow)

Captain (the main session) never edits code. It turns specs in docs/specs into orders, sends each to a Worker sub-agent, relays the Worker's change to a Reviewer (accurate / not accurate, max 3 rounds), then to Security (pass / fail; high and critical block), then Testing (docs/tests, every test run 3 times, any difference is nondeterministic). Every report gets exactly one recorded Captain action in the item's captain-log.md: route-security, route-verify, return-worker, next-order, escalate-human, close-item. Decisions go in decisions.md. Gaps the gates missed go in docs/learning-log.md. Human checkpoints: spec approval and final review.

Repository folder is lowercase docs/ (the skill says Docs/): this repo already tracks docs/ and Windows is case-insensitive.

## Project rules that still apply (CLAUDE.md)
One commit per story naming its issue (Closes #n); work on dev; never merge a PR; the dev database is never wiped; the docker stack is restored after the runtime suite.

## Bootstrap result (2026-10-28)
/mattpocock-skills:implement and /mattpocock-skills:setup-matt-pocock-skills are not available in this session. Owner chose "plain order briefs": the Captain writes each order itself with the same fields (target, technical action, constraints, AC IDs).
