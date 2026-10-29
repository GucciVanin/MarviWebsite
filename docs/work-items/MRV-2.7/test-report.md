# Test report MRV-2.7 (2026-10-28)
Environment: Windows 11, Docker node:24 (Angular CLI + Vitest/jsdom), `bash /tmp/ct.sh`. Data pinned in specs (no random seeds; no clock dependence besides the fixed last-updated string).
| Run | Client suite |
|---|---|
| 1 | 34 files, 279 pass |
| 2 | 34 files, 279 pass |
| 3 | 34 files, 279 pass |
Result: pass, deterministic. ACs: AC-1..4 notice specs; AC-5/6 privacy.spec; AC-7 footer+register specs; AC-8 whatsapp/notice specs (stacking via stubbed ResizeObserver, button type). Not covered: real-browser 375px layout (no browser check done); API and runtime suites not applicable (no backend change).
