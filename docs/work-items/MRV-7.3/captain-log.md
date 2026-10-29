# Captain log
- Worker O1-O5: complete (1104 x3, +17.2 kB gz vs pre-revamp). Action: route-security via Reviewer first; Captain browser pass in parallel.
- Captain browser pass (dev stack rebuilt): View Transitions API present; header/footer view-transition-name set; real click on Produtos navigates; defects: (a) anchor click on "Sobre" lands with the section top at 0 px while the sticky header is 136 px tall (scroll-padding 88px is not honoured: Angular's anchorScrolling uses window.scrollTo, not scrollIntoView); (b) html.anchor-nav is still set 2.5 s after the fragment navigation ended (class leak).
- Reviewer round 1: not accurate (reveal/count-up race; skeleton gap mismatch; anchor-nav class never cleared on End/Cancel/Error; architecture wording). Plus Captain browser defects (anchor lands under sticky header; class leak). Action: return-worker.
- Worker round 2: complete (1116 x3, +17.6 kB gz). Action: route-security; Captain re-checks anchors in browser.
- Security: pass (2 low optional: router.events subscription, matchMedia per call). Action: route-verify; Captain browser re-check.
- Testing: client x3 = 1116 pass. Browser re-check: fragment link lands 8 px below header, anchor-nav cleared, mobile menu opens/closes (hidden after transition), no overflow. Action: next-order.
