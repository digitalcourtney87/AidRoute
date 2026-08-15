# AidRoute design system — Night convoy

Visual thesis: a cream ops pack on a warm slate cab table. Chrome is dark; all reading and forms sit on paper. This is field kit, not a UK government service and not an intel dashboard.

Do not restore GOV.UK tokens: `#0b0c0c`, `#1d70b8`, `#003078`, `#ffdd00`, `#505a5f`. No crown, no GDS Transport, no Inter, no 10px organisation bar, no 2px bottom-shadow buttons, no yellow-plus-black focus ring.

## Surfaces

| Role | Token | Hex |
|---|---|---|
| Viewport / header | `slate` | `#161d1a` |
| Work sheet | `paper` | `#f3eee4` |
| Ink on paper | `ink` | `#1c1917` |
| Type on slate | `cream` | `#f3eee4` |

Body copy never sits on OLED black. Operators open this in daylight. `@media print` flattens to ink-on-white and hides slate chrome.

## Colour

| Role | Token | Hex | Notes |
|---|---|---|---|
| Action | `action` | `#d97706` | Amber fill, **ink** label, hover `#b45309` |
| Link | `link` | `#1a5c54` | Teal. Buttons are amber; links are teal |
| Muted on paper | `muted` | `#5c564e` | |
| Muted on slate | `muted-slate` | `#a8b0ab` | Subtitle only |
| Corroborated / do / fresh | `tint-teal` | `#d7e4df` / ink `#1a4a44` | |
| Single report / carry | `tint-dusk` | `#dfe0e8` / ink `#2f3550` | Not GDS blue |
| Conflict / error | `tint-oxide` | `#f0d4c4` / ink `#8a3310` | |
| Superseded / hairlines | `tint-stone` | `#e6e0d6` / ink `#5c564e` | |
| Verify / honest gap | `tint-amber` | `#f3e2c0` / ink `#7a4a0a` | |

Focus: 3px `action` on paper, 3px `cream` on slate (`.chrome :focus-visible`). Never `#ffdd00` plus a black inset.

## Type

- Wordmark and `h1`: Source Serif 4 (`font-serif`)
- UI: IBM Plex Sans (`font-sans`), tabular numbers on claim IDs
- Status words stay uppercase: CORROBORATED, SINGLE REPORT, CONFLICTING, SUPERSEDED, OFFICIAL. That is product language, not GDS.

## Controls

Shared strings live in `app/ui.ts`. Primary buttons: rounded, amber, ink text, no box-shadow. Secondary: ink border on paper. Fields: 1px ink border, 4px radius, paper fill.

## Layout

Sticky slate header (no colour bar). Max-width paper sheet in `app/layout.tsx`. Corridor brief uses a GB · FR · PL · UA route strip as wayfinding.

## Accessibility

WCAG AA on both slate and paper. Visible focus. 44px-class targets on primary actions. Keyboard order unchanged. Do not sacrifice contrast for atmosphere.
