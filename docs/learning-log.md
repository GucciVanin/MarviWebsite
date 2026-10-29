# Learning log

Gaps the gates missed. Fields: date, item, gap type (missing requirements, unchecked work, lost context at hand-off, unrecorded decision), what would have caught it.

- 2026-10-28 MRV-2.9, gap type: missing requirements (unchecked fact). The spec named a `/client` route that does not exist (the client area is `/portal`). Caught by the Worker and Reviewer. Would have caught it: the Captain grepping app.routes.ts for every path a spec names before issuing the order.
- 2026-10-28 MRV-2.8c/2.9, gap type: unchecked work. A security-relevant escape (`<` replaced with a no-op) and a mailto parameter-injection hole passed the Worker's own tests; only the Reviewer/Security gates found them. Would have caught it: a spec requirement "every sanitizer has a test with a hostile input" in the order template.
