# Captain log
- Worker O1-O4: complete (1129 x3, +13; bundle +20.8 kB vs pre-revamp). Action: route-security via Reviewer first; Captain browser pass in parallel.
- Captain browser pass (375/768/1280, 6 public routes): no horizontal overflow, one h1 each, hero/storefront cards render, reveal works, console clean. Lighthouse not yet run. Waiting for Reviewer.
- Reviewer round 1: not accurate (docs overclaim contrast; hero shapes can sit behind text on narrow screens; global 44px rule hits portals (.btn--small x64); 2 weak specs). Browser pass found no overflow. Action: return-worker.
- Worker round 2: complete (1131 x3, bundle +20.9 kB). Action: route-security.
- Security: pass (info: add pointer-events:none to decorative layers). Action: route-verify.
- Captain Lighthouse (docker femtopixel/google-lighthouse 13.5, dev stack): a11y 100 on home+storefront mobile+desktop (AC-24 gate met); perf mobile 44/39 (LCP 5.1-5.4 s, simulated throttling, not gated), desktop 75/76; CLS 0.909 mobile / 0.585 desktop: single shift source = app-footer (shell footer renders before the lazy route content, then jumps) => AC-19 (CLS 0 on home) not met. Action: return-worker.
- Testing: client x3 = 1132 pass. Browser: no overflow at 375/768/1280, Lighthouse a11y 100, CLS 0 after fix. Action: next-order.
