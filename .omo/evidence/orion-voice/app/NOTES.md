# Orion Voice App UI — Evidence & QA Notes

## Screen Brief & Layout Contract
- **Primary action**: `Talk to Orion` (`home-voice-start` / `chat-voice-button`) when idle; `End call` (`voice-end`) while a call is live.
- **Priorities 1-3**:
  1. Call state + reactive point-cloud orb (`voice-orb`).
  2. Live streaming line / plain-language activity rows (`activity-row`) and full-width `BrowserView` when a web page is open.
  3. Conversation input (`voice-text-input` on Home; single `chat-composer-input` in Chat) and mute / open-in-chat controls.
- **Left out on purpose**: Duplicate finished turns on the Chat stage, duplicate stage text field in Chat, raw tool/query/mutation identifiers (`db_query`, `animals.list`), BYO/Gemini API key prompts on voice plan errors.
- **Layout lines**:
  - `Layout: Home Voice Widget` -> inline-expandable panel inside `.orbit-home__head`; scroll owner: `.orbit-main-scroll` (and `.orbit-voice-captions` capped at `12rem`).
  - `Layout: Chat Voice Stage` -> pinned top region of `.orbit-thread-pane` outside `.orbit-thread-pane__scroll`; scroll owners: `.orbit-thread-pane__scroll` (`>= 208px` at `1440x900`) and `.orbit-voice-stage__body` (`max-block-size: min(26rem, 45dvh)`).
  - `Layout: Floating Voice Dock` -> fixed bottom-end pill (`voice-dock`) on non-Home / non-Stage routes.

## Measured Geometry (Playwright Chromium, `stage-geometry-v3.json`)
- **Chat stage without browser page (`1440x900`)**: stage `838 x 290`, orb `334 x 214`, transcript `318px` tall.
- **Chat stage without browser page (`390x844`)**: stage `340 x 360`, orb `312 x 186` above activity rows, `scrollWidth === clientWidth === 390`.
- **Chat stage with open browser page (`1440x900`)**: `BrowserView` `804 x 630` (`>= 720px`), compact header orb `42 x 42`, stage `838 x 400`, transcript `208px` tall (`>= 200px`).

## Captured Artifacts (`.omo/evidence/orion-voice/app/`)
- Seeded Home idle & live: `home-idle-{1440,390}-{light,dark}.png`, `home-live-{1440,390}-{light,dark}.png`, `home-guide-highlight-1440-light.png`, `home-micless-1440-light.png`
- Minimal (unseeded) Home idle & live: `minimal-home-idle-{1440,390}-{light,dark}.png`, `minimal-home-live-{1440,390}-{light,dark}.png`
- Floating dock on `/settings`: `dock-settings-{1440,390}-{light,dark}.png`
- Chat stage before/after (without browser page): `before-chat-stage-{1440,390}-{light,dark}.png` and `after-chat-stage-{1440,390}-{light,dark}.png`
- Chat stage before/after (with browser page open): `before-chat-stage-browser-1440-light.png` and `after-chat-stage-browser-{1440,390}-{light,dark}.png`
- Metrics JSON: `metrics.json`, `stage-geometry-v3.json`
