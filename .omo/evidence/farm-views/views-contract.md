# Farm views: shared contract for the herd, calendar and cameras views

Repository: /Users/kristianvastveit/projects/orbit (Bun monorepo, read AGENTS.md at the root). You build ONE view folder under
skills/farm-views/pages/<view>/. Two sibling agents build the other two views at the same time.

## What the owner asked for (verbatim intent)
"For our example seed and for portable plugins for Orion to add for farmers, let's take inspiration
from LIV-app on herd card and panel, as well as the cow cards and panels. But here Orbit adds the
filters and info on cows that the farmer actually uses. This will be a skill for Orion so if the
farmer asks for something to show his animals, Orion builds from what we have tested and tunes it to
the farmer's need, or builds on it. The same for the calendar panel and card, and camera card and panel."

So each view is a TESTED STARTING POINT that Orion (an AI agent working for a farmer) copies into a
farm's workspace and then tunes. Two consequences drive every decision:
1. What a farmer sees is chosen in config.json. The view ships a small default and a documented
   menu of tested options. Orion turns options on by editing config.json; it only edits code to add
   something new. Unknown ids in config.json are ignored, never an error.
2. The code is read and extended by an AI agent: plain HTML + CSS + small ES modules, no build step,
   no dependencies, no CDN or external request (the farm PC may be offline), clear names.

## The plugin folder
skills/farm-views/pages/<view>/
  page.json    { "title": "...", "description": "...", "card": "card.html" }
  index.html   the PANEL: the full screen, shown in Orbit under "Your pages"
  card.html    the CARD: a small summary Orbit shows on Home; the whole card is a link to the panel
  config.json  what this farm uses (filters, facts, settings). Strict JSON, no comments.
  <view>.js    ES module with the PURE logic (no DOM, no orbit calls): filtering, sorting, deriving
  <view>.test.ts  bun:test unit tests for <view>.js (tests are not shipped to farms)
  other .js / .css files as needed, loaded by relative path.

## How Orbit shows them (already built, do not change platform code)
- Both files run inside <iframe sandbox="allow-scripts allow-forms">: an OPAQUE ORIGIN. No
  localStorage/cookies, no pop-ups, no parent access, links cannot navigate the app. Orion serves the
  folder at http://127.0.0.1:<port>/pages/<token>/<view>/... with Access-Control-Allow-Origin: *, so
  <script type="module" src="./x.js">, import, and fetch("./config.json") work.
- The CARD iframe on Home is 280-440 px wide and exactly 208 px tall, pointer-events are off (the
  tile is one link), and Home prints the page title above it. So card.html: no title, no controls,
  no scrolling, must not overflow 208 px at 280 px width. Use <body class="kit-cardview">.
- The PANEL iframe fills the app's main area (about 1000 px wide on desktop, 390 px on a phone).
- In <head>, in this order:
    <link rel="stylesheet" href="../_orbit.css">
    <script src="../_orbit.js"></script>      (classic script, no defer/module)
  _orbit.js sets <html data-theme="light|dark"> and <html lang> from the app (?theme=&lang=) and gives
  window.orbit:
    await orbit.query(name, params)   await orbit.mutate(name, params)
    orbit.on((event) => { if (event.type === "db.changed") ... })   // event.table, event.ids
    orbit.cameraFrame(cameraId) -> URL of that camera's latest JPEG (append "?t=" + Date.now())
  Source: packages/orion/src/services/pages.ts (PAGE_SDK).
- Refresh when data changes: orbit.on db.changed for the tables you read (debounce ~300 ms).

## Data you can read (packages/protocol/src/db.ts is the contract; read it)
- farm.summary {} -> { farm, counts:{cattle,horses,devices,devicesOffline,cameras,camerasOnline,...}, recentAlerts }
- animals.list { species?, status?, groupName?, search?, limit<=1000 } -> { rows, total }
  row: id, species ("cattle"|"horse"), name, earTagNumber, nationalId, breed, sex
  ("female"|"male"|"castrated"|"unknown"), birthDate (YYYY-MM-DD), groupName, status
  ("active"|"sold"|"dead"; the default list is what the repo returns, check repo.ts), notes,
  lactationStatus ("dry"|"lead"|"fresh"|"early"|"lactating"|null),
  reproductionStatus ("open"|"inseminated"|"pregnant"|"not_pregnant"|"birthed"|"do_not_breed"|
  "pregnant_multiple_foetus"|null), wearable: { deviceId, kind ("collar"|"bolus"|"ear_tag_sensor"),
  vendor, batteryPct } | null
- animals.get { id } -> { animal, wearable, bindings, devices, recentObservations (latest 50) }
- observations.recent { animalId?, kind?, since? (ISO), alertsOnly?, limit<=1000 } -> { rows }
  row: id, animalId, deviceId, kind, ts (ISO), valueNum, valueJson, source
  kinds: milking (valueNum kg), activity, rumination (min/day), temperature (C), weight (kg),
  alerts: health_event, calving_alert, heat_alert (valueJson.message, .severity),
  recorded events: insemination (valueJson.inseminationType), pregnancy_check (valueJson.result
  "Pregnant"|"Empty"|"Multiple"|"Unknown"), calving, abortion, dry_off, treatment
  (valueJson.procedure, .message), arrival, departure, birth, death.
  The 1000-row limit is real: never compute a herd-wide number from a query that could be cut off.
  Per-animal numbers (for example a 7-day milk average) come from per-animal queries
  ({ animalId, kind, since }), run a few at a time, only when the config asks for that fact.
- cameras.list {} -> { rows: id, name, location, status ("online"|"offline"|"error"|"unknown") }
- cameras.relay {} -> { available, reason }
- Writes: animals.upsert { animal: { id, species, ...fields } } (see AnimalInput in
  packages/protocol/src/model.ts), observations.add { animalId?, kind, ts, valueNum?, valueJson? }.
  Every write can be undone by the farmer; keep writes few and explicit.

## The seeded demo farm you test against (packages/schema/src/seed.ts, read it)
28 animals: 16 dairy (Bella DK-1001 ... Fern DK-1016; groups Milking 10, Dry 4, Heifers 2), 8 beef
(group Pasture), 4 horses (group Stable). 3 alerts in the last 7 days: Rosa heat_alert (5 h ago),
Poppy health_event (23 h ago, 40.4 C), Ruby calving_alert (2 h ago). 7 days of milkings for the 10
milking cows (3 a day, 9-14 kg each), rumination/activity/temperature readings, horse weights.
Reproduction: Bella and Daisy fresh; Molly, Luna and Dolly inseminated (Luna's pregnancy check is 3
days overdue); Stella, Clover, Maple, Hazel, Ivy in calf and milking (Ivy's dry-off is due in 5
days); Willow, Poppy, Ruby, Pearl dry and in calf (Ruby due tomorrow, Pearl in 14 days, Poppy 28,
Willow 40); beef cows Ginger and Tank in calf; mare Saga in foal (due in 40 days, 340-day gestation).
3 cameras: "Robot entrance" (Milking parlour, online), "Calving pen" (Calving pen, online), "Stable
aisle" (Horse stable, offline). No real video exists: frame.jpeg requests fail, so the camera view
must degrade to a clear placeholder.

## Look and feel: Orbit's design system (apps/orbit/DESIGN.md - read it fully, it is short)
- _orbit.css = the app's tokens and primitives (apps/orbit/src/design/tokens.css: CSS variables,
  .orbit-btn --primary/--secondary/--subtle + --sm/--md, .orbit-badge --neutral/--ok/--warn/
  --danger/--info/--accent, .orbit-input, .orbit-select, .orbit-field, .orbit-label, .orbit-card,
  .orbit-visually-hidden, .tabular-nums) followed by the page kit
  (packages/orion/resources/pages/kit.css: kit-page, kit-page__head/__title/__meta, kit-cardview,
  kit-section, kit-figure, kit-caption, kit-toolbar, kit-chips + kit-chip[aria-pressed],
  kit-list + kit-row, kit-tiles + kit-tile, kit-tag, kit-dot[data-tone], kit-facts, kit-meter,
  kit-sheet (a <dialog>), kit-note). READ BOTH FILES and use these before writing your own CSS.
  View-specific CSS goes in a <style> block or a .css file in your folder and uses ONLY the tokens
  (var(--...)); no hard-coded colours, sizes come from the spacing/type tokens.
- Fonts: h1/h2 are Tanker, uppercase (the kit does this). Everything else Switzer. Ear tags and
  ids in .kit-tag (mono). Counts use tabular numerals.
- Rules that get work rejected: no emoji (inline SVG icons only, one consistent stroke set, e.g.
  Lucide paths, aria-hidden); no coloured stripe on one side of a box; no 2px accent outline on
  cards; no cards inside cards; no gradients, glass, glows or shadows on panels (shadow only on
  the kit-sheet dialog); a badge only for a value that changes; no subtitle under every heading;
  no stat tile nobody acts on; no marketing words. Rows inside a panel are separated by hairlines.
- One primary action per screen at most. Hit targets >= 44 px on touch, >= 24 px otherwise.
  Every control has hover, focus-visible and disabled states and a stable size across states.
- Every data view has loading (skeleton or quiet "Loading..." text, no layout jump), empty (says
  what is missing and what to ask Orion), and error (plain cause) states.
- Works at 390 px and 1280 px wide, light and dark theme, no horizontal page scroll at 320 px.
- Keyboard: everything reachable by Tab in reading order, Escape closes the dialog, visible focus.

## Copy rules (hard)
- Plain farmer words, English, sentence case. Country-neutral: no country defaults, no currency,
  kg and C as recorded. Dates and numbers through Intl with document.documentElement.lang.
- Species: cattle (dairy and beef) and horses. "calving" for cattle, "foaling" for horses.
- ONE WEARABLE RULE: an animal wears a collar OR a bolus OR an ear tag sensor, never several. Show
  the one it has ("Collar, battery 82%") or "No sensor". Never offer to add a second.
- Health: alerts are signals, not diagnoses. Never state a diagnosis; where health alerts are
  shown in detail, one quiet line says to check the animal and call the vet for medical decisions.
- No vendor or product names.

## Logic module and tests
- <view>.js exports pure functions that take plain data (animals, observations, config, now) and
  return plain data. The HTML files import it and only do fetching + rendering.
- It holds the REGISTRY of tested options (each option: id, label, and its rule as a function).
  config.json lists ids; the module resolves them and skips ids it does not know.
- <view>.test.ts (bun:test, import from "./<view>.js"): one test per rule in the registry plus the
  config-resolution behaviour (unknown id skipped, order follows config, defaults when a key is
  missing). Tests must fail when the rule breaks: no snapshot dumps, no asserting constants.
  Fixed "now" passed in; never Date.now() inside a rule.
- Run: cd /Users/kristianvastveit/projects/orbit && bun test ./skills/farm-views/pages/<view>

## Your dev loop (own port, own temp dir; never touch the others')
  export RUN=$(mktemp -d)
  cd /Users/kristianvastveit/projects/orbit
  ORION_SECRETS=file ORION_FAKE_CAMERAS='[]' bun packages/orion/src/main.ts --port <PORT> --token qa --mock-model --seed --data-dir "$RUN/data"      # long-running: start it as a background session
  # after every edit, copy your folder into that farm's workspace (tests are not needed there):
  rsync -a --delete --exclude '*.test.ts' skills/farm-views/pages/<view>/ "$RUN/data/workspace/pages/<view>/"
  # the page, as Orbit loads it (sandboxed, opaque origin) - open this file URL in a real browser:
  file:///var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.ptu8EU7Y46/harness.html#src=<urlencoded http://127.0.0.1:<PORT>/pages/qa/<view>/index.html?theme=light&lang=en>&w=1280&h=800&bg=%23f6f3ec
  # card: same with card.html and w=320&h=208 (also w=440&h=208); dark: theme=dark and bg=%23111310
  curl -s http://127.0.0.1:<PORT>/health   # readiness
Take screenshots with a real browser (new Bun.WebView() from a js eval cell, or the browser skill)
and LOOK at each one before the next change. Check the frame's console for errors.

## Definition of done (all required)
1. Files listed above exist in your folder only; nothing else in the repo is modified. Do not run
   scripts/build-skills-index.ts, do not install packages, do not commit.
2. bun test ./skills/farm-views/pages/<view> passes; bunx biome check skills/farm-views/pages/<view> is clean.
3. Screenshots you have looked at, saved under /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.ptu8EU7Y46/shots/<view>/: panel at 1280x800 and
   390x844 in light and dark; card at 320x208 and 440x208 in light and dark; the detail dialog (if
   your view has one); the empty state (start a second Orion without --seed on <PORT>+10 for it).
4. No console errors or failed requests in the sandboxed frame (except camera frames, which have no
   real video here).
5. Your Orion processes are stopped and the ports are free (lsof -i :<PORT> prints nothing); remove $RUN.
6. Final message: files written, the config.json schema with every option id and its rule in one
   line each, test output tail, screenshot paths, anything you could not verify and why.
