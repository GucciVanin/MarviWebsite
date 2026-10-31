# Follow-up: 200% text zoom on the 9.2 customer page, the lookup widget and the address badge (MRV-9.2 / MRV-9.3)

Found by Testing (testing-report.md, "Finding: text zoom 200%"). Goal: back to the 8.5 standard, zero overflow-page / overflow-element / exceeds-parent / container-edge at 200% text at 320 and 375 in every group. No rule weakened, no exemption, client-only.

## Causes and fixes
| Finding | Cause (measured with a throwaway probe, not committed) | Fix |
|---|---|---|
| 4 `overflow-page` on `/employee/clientes/C-000001` and `C-999999` | Not tables (they sit in `.table-wrap`). The `.btn` labels are `white-space: nowrap`, and `app-customer-page` is not in the portal hosts that let form/toolbar buttons wrap below 40em: the back link ("Voltar a area do funcionario") and the "Iniciar pedido" button were wider than the 288 px content (back link 421 px of text) and widened `app-root` and `html` | `btn--wrap` (the existing opt-out) on those two buttons in `customer-page.html` |
| 24 `exceeds-parent`, `dl.lookup__facts` rows in the widget | `repeat(auto-fit, minmax(10rem, 1fr))`: at 200% the 10rem minimum is 320 px, wider than the dialog | `minmax(min(100%, 10rem), 1fr)` in `customer-lookup.scss` (same form `.facts` already uses) |
| 12 `exceeds-parent`, `.badge--warn` "Precisa ser completado" in `app-address-summary` | The badge is a flex item with `min-width: auto`; at 200% it was 9.2 px wider than the card | `.badge { min-width: 0; max-width: 100%; overflow-wrap: anywhere }` in `_components.scss` |

## Numbers (text zoom 2, widths 320 and 375, all groups, 66 loads)
| | before | after |
|---|---|---|
| total findings | 212 | 172 |
| overflow-page | 4 | 0 |
| exceeds-parent | 36 | 0 |
| overflow-element / container-edge | 0 | 0 |
| wrapped-control (reported) | 168 | 168 (same set; the two customer-page buttons are `btn--wrap`, exempt below 640 px) |
| covered-text (reported) | 4 | 4 |

An intermediate attempt (adding `app-customer-page` to the scoped host list) fixed the overflow but made the "Iniciar pedido" button wrap on the normal audit at 320 (1 violation); the per-button `btn--wrap` was used instead.

## Verification (dev stack rebuilt with `up -d --build client`)
- `bash test/layout/run.sh`: 0 violations over 264 loads, exit 0, `skipped: []`.
- `bash test/layout/run.sh --fixtures`: 25 fixtures, 0 failed. No new fixture: the existing `exceeds-parent` and `overflow-page` rules already catch these classes; the 200% run is where they appear.
- `bash test/layout/axe.sh`: 0 violations on 40 pairs.
- Client suite (`bash /tmp/ct.sh`, alone) x3: 1296 passed, 72 files, each time.
- Bundle (`gzip -9 -n -c` per js/css file in the running client image, `island/ribbons.js` excluded): 217,318 B (gate 237,975).
- Dev DB: read and sign-in only.
