# Guide Module Visual QA & Evidence Notes

## Summary

Verified `GuideOverlay` (`guide-highlight`, `guide-pointer`, `guide-note`) and `BrowserView` (`browser-view`, `browser-view-frame`, `browser-highlight`) mounted over the Orbit `AppShell` layout using the self-hosted Pecorva type system (`Tanker`, `Switzer`, `Azeret Mono`) and Observatory Ledger / Night Watch tokens (`apps/orbit/src/design/tokens.css`).

## Layout Contract

- `Layout: Guide Overlay - fixed viewport annotation layer tracking target DOM rects on scroll and resize -> imposter + overlay-stack (skipped: host unreachable); scroll owner: none (pointer-events: none pass-through over .orbit-main-scroll); anti-patterns: intercepting farmer clicks outside the close button, clipping note bubble or ring off viewport edges, using system cursor icon instead of Orion mark.`
- `Layout: Browser View Panel - bounded media frame scaling remote browser JPEG with page title/address header and proportional pixel-mapped highlight overlay -> frame + overlay-stack (skipped: host unreachable); scroll owner: parent container (.orbit-main-scroll or voice stage); anti-patterns: unscaled pixel coordinates after container resize, rendering empty frame before first browser.view or after image: null, overflowing long URLs without truncation.`

## Captures (`.omo/evidence/orion-voice/guide/`)

1. **Highlight with note (`Settings` nav item highlighted + note `"Orion: Settings are here."`)**
   - `highlight-1440-light.png` (1440x900, Daylight light)
   - `highlight-1440-dark.png` (1440x900, Night Watch dark)
   - `highlight-390-light.png` (390x844 @ DPR 3, Daylight light; horizontal nav rail auto-scrolled to `Settings`, note clamped at `left: 131..378px`)
   - `highlight-390-dark.png` (390x844 @ DPR 3, Night Watch dark)
2. **Pointer mid-click (`runAppAction({ action: "click" })` captured mid-glide at `data-phase="moving"`)**
   - `mid-click-1440-light.png` (1440x900, Daylight light)
   - `mid-click-1440-dark.png` (1440x900, Night Watch dark)
   - `mid-click-390-light.png` (390x844 @ DPR 3, Daylight light)
   - `mid-click-390-dark.png` (390x844 @ DPR 3, Night Watch dark)
3. **BrowserView with scaled highlight box and note (`1280x760` JPEG scaled to desktop `503x299` and mobile `356x211`)**
   - `browser-view-1440-light.png` (1440x900, Daylight light; `Sync records (0)` incremented to `(1)` confirming real click execution)
   - `browser-view-1440-dark.png` (1440x900, Night Watch dark)
   - `browser-view-390-light.png` (390x844 @ DPR 3, Daylight light; highlight scaled to `129x30px`, note aligned inside right edge)
   - `browser-view-390-dark.png` (390x844 @ DPR 3, Night Watch dark)
4. **Keyboard focus ring & probe telemetry**
   - `focus-ring-1440-light.png` (`.orbit-guide-note__close` `:focus-visible` 2px `--border-focus` ring)
   - `probe-report.json` (bounding boxes, contrast ratios, scroll/reflow checks)

## Visual Fixes Applied During Inspection

1. **Pointer anchor offset during `click`:** Adjusted `measureElementCenter` in `actions.ts` to target the bottom-trailing press zone (`0.78w, 0.76h`) rather than dead-center (`0.5w, 0.5h`) so button labels remain completely legible during pointer glide and press.
2. **Right-edge clamping for `BrowserView` highlight notes:** Added `noteAlign: "start" | "end"` in `computeScaledBrowserHighlight` (`geometry.ts` + `guide.css`) so highlight boxes in the right half of `browser-view-frame` anchor their note bubble's trailing edge (`inset-inline-end: 0`), preventing right-edge clipping at `390x844`.
