# Ultrawork Notepad — LIV-inspired herd/cow/calendar/camera cards+panels as portable Orion plugins (catalog skill) + example seed
Started: 2026-11-10T10:49:10.034Z
RUN_TMP: /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.ptu8EU7Y46
Orphan from a failed first mktemp (helper bug): $TMPDIR/ulw-20261110-104626.XXXXXX.md.AZtzQabkGt (+ one empty tmp.* dir) — remove at teardown.

## Skills chosen
- bun (read): js eval kernel is Bun; governs Bun.$ / bun test usage.
- frontend (to read before building the page templates): cards/panels are HTML/CSS surfaces.
- visual-qa (to read at QA): screenshot evidence of cards/panels at desktop + mobile, light + dark.
- browser (to read at QA): drive the real app page for the browser-facing criteria.
- git-master (to read before committing): only this session's hunks; tree holds unrelated uncommitted work.
- memory-discipline (to read before saving memory).
- Not used: ulw-plan/plan-* (user did not request a plan workflow), review-work (no review demanded), hyperframes/media (no video).

## Findings (discovery wave 1)
- Orbit starts minimal: Home/Chat/Settings; built-in modules herd/devices/cameras (packages/orion/src/services/modules.ts, apps/orbit/src/lib/modules.ts) — UNCOMMITTED work of another session, as are ~60 other files (git status). HEAD=6a927e3, origin/main=eefc834.
- Custom pages = <workspace>/pages/<id>/{page.json,index.html}; listed by listPages (packages/orion/src/services/pages.ts:36), served at /pages/<token>/<id>/..., SDK at /pages/<token>/_orbit.js (PAGE_SDK, pages.ts:71) -> window.orbit.query/mutate/on. App shows them in nav 'Your pages' (apps/orbit/src/app/shell.tsx:204) inside a sandboxed iframe (apps/orbit/src/features/pages/index.tsx:60, sandbox='allow-scripts allow-forms').
- CustomPage protocol type: {id,title,description?,path} (packages/protocol/src/model.ts:152). No notion of a Home card for a page.
- Home (apps/orbit/src/app/HomePage.tsx) has alerts panel + status gauges; no pluggable cards.
- Skill catalog: skills/index.json built by scripts/build-skills-index.ts (--check in packages/orion/test/skills.test.ts:137); SkillService (packages/orion/src/services/skills.ts) installs into <workspace>/skills/<name>; skill.json manifest currently only allows {name,version,connector?}; tools skill_search/skill_install (tools.ts:499-545); connector_scaffold {fromSkill} copies a skill's connector dir (tools.ts:265).
- Named queries available to pages (packages/protocol/src/db.ts:27): farm.summary, animals.list, animals.get, devices.list, bindings.list, connectors.list, observations.recent(animalId,kind,since,alertsOnly,limit<=1000), cameras.list, cameras.relay, cameraLayout.get. Mutations: observations.add, animals.upsert, ...
- Animal fields (packages/schema/src/sqlite.ts:44): species,name,earTagNumber,nationalId,breed,sex,birthDate,groupName,status,reproductionStatus,lactationStatus,notes. Observation kinds include insemination, pregnancy_check, calving, abortion, dry_off, treatment, arrival, departure, birth, death (enums.ts) — calendar can be derived from these.
- Seed (packages/schema/src/seed.ts): 24 cattle + 4 horses, no reproductionStatus/lactationStatus, no reproduction events -> calendar/cow panel would be empty on the demo farm.
- LIV calendar/camera report (explore st_01a1c512): calendar card = date + Monday-start week strip with highest-priority event icon per day + next task hero; panel = day/week/month, month cell up to 4 icons +N, selected-day list; LIV does NOT derive events from animal fields (consumes stored breeding events); AnimalSlide adds 280 days for expected calving. Camera card = live preview of first camera (favourite barn first) + status + count; panel = barn map canvas.

## Tier
HEAVY — new abstraction (custom page contributes a Home card), cross-package contract (protocol CustomPage.card, page serving + CORS, skill manifest pages, new page_scaffold tool), seed data change. Reviewer gate NOT triggered (no ulw-plan file, no review demanded) -> self-review in notepad.

## Decisions (with evidence)
D1 Plugin = custom page folder pages/<id>/{page.json,index.html,card.html,config.json}; why: user said "portable plugins for orion to add" + "a skill like the one that exists"; pages are the only runtime-addable UI (ARCHITECTURE.md:241) and the delaval skill already ships a folder that a scaffold tool copies (tools.ts:265).
D2 Card = card.html rendered by Home in a sandboxed, non-interactive iframe tile whose whole surface links to /pages/<id>; LIV: card click navigates to panel route (NavigationCards.tsx:210-216).
D3 One catalog skill 'farm-views' with three views (herd incl. cow card+panel, calendar, cameras) — user said "a skill".
D4 Tuning = config.json per view listing which filters / facts / badges / sections the farmer uses; registry of tested options lives in the view's logic module; SKILL.md documents the menu. This is "orbit adds the filters and info on cows that the farmer actually uses".
D5 page_scaffold {fromSkill,page,id?} tool mirrors connector_scaffold; refuses to overwrite an existing page (protects farmer tuning).
D6 Sandboxed iframes have an opaque origin: ES module imports, fetch('./config.json') and fonts need CORS -> servePage adds Access-Control-Allow-Origin:* (token in path already gates access; WS has no origin check). Enables config.json + importable/tested logic modules.
D7 Kit: Orion serves /pages/<token>/_orbit.css (tokens + components) and /pages/<token>/_fonts/* (Tanker, Switzer 400/500/600 embedded, ~75KB) so plugin pages match the app. App passes ?theme=&lang= to frames.
D8 Cameras view uses snapshot frames (/camera/<token>/<id>/frame.jpeg), not MSE live video: live playback cannot be QA'd without a real RTSP camera (memory 2026-11-camera-panel); live stays in the built-in Cameras screen. Report as limitation.
D9 Calendar events are derived client-side from observations (insemination -> pregnancy check due +35d, expected calving +gestation, dry-off due = calving - 60d; all configurable; LIV only has the 280-day rule in AnimalSlide.tsx:91-100). No schema change.
D10 Per-animal milk 7d average: per-animal observations.recent queries (limit 1000 herd-wide would truncate on real farms).
D11 Shared reproduction math lives in one file copied byte-identical into herd/ and calendar/ (views stay independent); a toBe equality test pins the two copies.
D12 Seed: seedDemoFarm appends status fields + events AFTER existing id() draws so existing ids stay stable; orion --seed installs the views from the skills source best-effort (stderr on failure).
Not asked of user: all forks resolved from the request wording; built-in Herd/Cameras modules stay (not requested to remove) — flag duplicate nav entries in final report.

## Plan (ordered)
P0 baseline typecheck/lint/test on untouched tree -> $RUN_TMP/base-*.log
P1 protocol: CustomPage.card {path}
P2 orion pages.ts: card listing (entry inside folder, exists), PAGE_KIT_CSS, fonts, CORS header in app.ts servePage; scaffoldPage()
P3 orion skills.ts manifest.pages; tools.ts page_scaffold + FARM_TOOL_NAMES + mock triggers; skill_search description
P4 seed.ts enrichment + seed.test.ts; app.ts seed views
P5 tests: orion.test.ts custom pages (card, css, cors), skills.test.ts page scaffold (happy, conflict, escape)
P6 FAN-OUT (after P1-P5 green, Orion can serve): 3 parallel visual-engineering children, disjoint write scopes skills/farm-views/pages/{herd,calendar,cameras}; each: logic module + bun unit tests + card.html + index.html + config.json + page.json, verified in a browser against its own seeded Orion port. Why fan out: independent, large, disjoint dirs. I keep: contract, kit, Home, skill prose, e2e, QA, commits (need cross-cutting judgment).
P7 app: HomeCards + theme/lang params + i18n en/nb + tests
P8 SKILL.md/skill.json/index.json; built-in skills + AGENTS.md + ARCHITECTURE.md
P9 e2e spec + browser QA + WS/curl QA; full checks; self-review; cleanup; commits; memory.

## Success criteria + QA scenarios
See registered goal (C1-C5); full text in the goal objective file.

## Now
P0 baseline running; P1 next.

## Todo
P1..P9 as above.

## Learnings
- js eval: read() is async; tool.bash returns {text}; output lines clamp at 768 cols.

## Baseline (untouched tree, HEAD 6a927e3 + other session's uncommitted work)
- typecheck rc=0 ($RUN_TMP/base-typecheck.log); test rc=0 ($RUN_TMP/base-test.log)
- lint rc=1 PRE-EXISTING (not mine):    1 core/voice-demo/agent-config.json format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ |    1 core/voice-demo/tools/find_cow.json format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ |    1 core/voice-demo/tools/log_event.json format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ |    1 core/voice-demo/tools/query_herd.json format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ |    1 core/voice-demo/tools/set_calving_alert.json format ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ |  ($RUN_TMP/base-lint.log)

## Progress 2026-11-10T11:04:18.761Z
- P1-P5 platform written. Checks: typecheck protocol/schema/orion rc=0, schema seed+ade tests 37 pass, orion orion/skills/resources tests 31 pass ($RUN_TMP/p1/*.log). biome fixed (import order).
- Files touched (mine): packages/protocol/src/model.ts, packages/orion/src/{app.ts,resources.ts,assets.d.ts,services/pages.ts,services/skills.ts,agent/tools.ts,agent/mock-model.ts}, packages/orion/resources/pages/kit.css (new), packages/orion/test/{orion,skills}.test.ts, packages/schema/src/seed.ts, packages/schema/test/seed.test.ts, skills/farm-views/pages/{herd,calendar}/repro.js (+ herd/repro.test.ts).
- SDK gained theme/lang application and orbit.cameraFrame(id).
- Seed names: heat=Rosa(dairy2), health=Poppy(dairy11), calving alert=Ruby(dairy12, due tomorrow). In calf: 12 (5 milking + 4 dry + Ginger, Tank + Saga). due-soon(<=14d): Ruby(1), Pearl(14).
- Fan-out: children view-herd st_01a1c521 (port 7831), view-calendar st_01a1c522 (7832), view-cameras st_01a1c523 (7833); contract $RUN_TMP/views-contract.md; harness $RUN_TMP/harness.html; shots $RUN_TMP/shots/<view>/.
- Card tile contract: iframe 280-440 x 208 px, pointer-events none, Home prints title.
## Now
App: Home cards + theme/lang params (me) while children build views.

## Progress 2026-11-10T11:10:29.326Z
- App: features/pages/{url.ts,PageCards.tsx,pages.css} new; index.tsx (theme prop, lang), HomePage.tsx (+PageCards in both branches, below alerts grid per DESIGN.md anti-pattern "burying alerts"), routes.tsx (theme prop), i18n pages en+nb (cards.label, cards.frameTitle). Checks $RUN_TMP/p7: biome 0, typecheck 0, vitest 0.
- Added Orion tool herd_record_event (+ test in orion.test.ts 'animal events'): chat Orion had NO way to record insemination/calving etc, so the calendar would be empty on every real farm. Decision: in blast radius (calendar copy says Orion can record them).
- repro.js now treats a dry_off since last calving as dry and "in milk" = cattle with lactation status or a calving on record (works when statuses are null). Both copies identical; 7 tests pass.
- skills/farm-views/{SKILL.md,skill.json,views.test.ts} written; built-in skills custom-pages, building-features, herd-data + resources/AGENTS.md updated; docs/ARCHITECTURE.md + apps/orbit/DESIGN.md updated.
- e2e spec packages/e2e/web/farm-views.spec.ts written (not yet run; needs views + index.json).
- P1B orion tests: 29 pass, 1 fail = 'repository catalog matches the skill files' EXPECTED until index.json is regenerated after children finish (regression caught by check: skills.test.ts catalog --check).
## Now
Waiting on view children; then regenerate skills/index.json, run seeded Orion + Vite, e2e, QA.

## QA resources (smoke)
- Orion 7821 bash={"bash_id":"bash_75","background":true} data /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.ptu8EU7Y46/qa-smoke
- Vite 5193 bash={"bash_id":"bash_76","background":true}

## Smoke (Home card pipeline) 2026-11-10T11:11:57.114Z — PASS
- Throwaway page pages/smoke (card.html + module import + fetch ./config.json) in seeded Orion 7821 + Vite 5193: Home rendered home-card-smoke; frame src http://127.0.0.1:7821/pages/qa/smoke/card.html?theme=light&lang=en-US; sandbox=allow-scripts; frame 361x208; link /pages/smoke; card showed "28 animals · theme light · lang en-US" and fonts "Tanker 400, Switzer 400" loaded cross-origin. Screenshot $RUN_TMP/shots/smoke/home-1280.png (looked at: tile renders below alerts grid, flat panel, title + chevron).
- Receipt: Orion smoke bash_75 killed; listeners on 7821 = 0; Vite bash_76 still up on 5193 (listeners 1) — kept for final QA, MUST kill at teardown. Browser profile removed in finally.
- Browser tooling: omowright connectPipe + chrome-headless-shell at ~/Library/Caches/ms-playwright/chromium_headless_shell-1248/...; helper withBrowser(size, fn) in js kernel; use emulate() for viewport.
- visual-qa skill demands dual reviewer subagents; ultrawork directive (user mode) says no reviewers unless the gate triggers -> I run its capture matrix + checklist myself and say so.

## Child view-calendar (st_01a1c522) completed 2026-11-10T11:17:41.319Z
- Files: skills/farm-views/pages/calendar/{page.json,config.json,calendar.js,calendar.test.ts,index.html,card.html} (+repro.js untouched). 13 tests pass, biome clean, draft-guard clean. Ports 7832/7842 free (listeners: 0).
- Verified vs seed: Coming up = Luna check 3d overdue, Ruby calving tomorrow, Ivy dry-off 5d, Pearl 14d, Molly check 23d, Poppy 28d, Dolly check 29d, Hazel dry-off 35d, Willow 40d, Saga foaling 40d. Card: "Next: Calving due, Ruby DK-1013, tomorrow" + "1 overdue".
- Shots: $RUN_TMP/shots/calendar/*.png (10). Unverified by child: detect CLI crashed (WebKit eval error) -> checked reflow manually in Chromium.

## Child view-cameras (st_01a1c523) completed 2026-11-10T11:21:14.073Z
- Files: skills/farm-views/pages/cameras/{page.json,config.json,cameras.js,cameras.test.ts,index.html,card.html}. 21 tests pass, biome clean, draft-guard clean (re-run by me: see below). Ports 7833/7843/7853 listeners: 0.
- Verified: summary '2 of 3 online'; chips All 3 / Calving pen 1 / Horse stable 1 / Milking parlour 1; offline tile never requests a frame; showing path proven via Bun.serve stub proxy on 7853 alternating two JPEGs (src swapped on refresh); unavailable path calm placeholder; dialog refresh + Escape + focus return; config hide/locations override.
- Finding fed back into kit: .orbit-btn display:inline-flex beats [hidden] -> kit.css now has [hidden]{display:none!important}.
- Shots: $RUN_TMP/shots/cameras/*.png (15).

## QA resources (final)
- Orion 7821 seeded + --app-source, bash=bash_89, data /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.ptu8EU7Y46/qa-seed, stderr $RUN_TMP/qa-seed-orion.err
- Vite 5193 bash=bash_76 (from smoke)
- Orion 7822 fresh (no seed) + --skills-url, bash=bash_96, data /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.ptu8EU7Y46/qa-fresh

## C3 PASS + C4 (HTTP part) PASS 2026-11-10T11:34:51.380Z — artifact $RUN_TMP/c3-c4.json
- Fresh Orion: bun packages/orion/src/main.ts --port 7822 --token qa --mock-model --data-dir $RUN_TMP/qa-fresh --skills-url <repo>/skills
- WS chat: "find a skill for my herd" -> skill_search lists farm-views; "install the farm views skill" -> skill_install (19 files); "add the herd view" -> page_scaffold "Added pages/herd/ ... as a card on Home"; pages.list before [] / after herd with card.path /pages/qa/herd/card.html.
- Second "add the herd view" after tuning config.json filters -> isError conflict "a page pages/herd already exists"; config.json byte-identical (configUnchanged true).
- curl: /pages/qa/herd/card.html 200 + ACAO *; /pages/wrong/herd/card.html 401; /pages/qa/herd/..%2F..%2FAGENTS.md 404; config.json 200 application/json + ACAO *; _orbit.css 200 text/css; /fonts/tanker-400-normal.woff2 200 font/woff2 + ACAO *.
- C1 partial (omowright, 1440 light+dark): 3 cards present, frame srcs carry theme/lang, nav to /pages/herd ok. Found + fixed: document scrolled behind the shell (visually-hidden span escaped .orbit-main-scroll; 949px pre-existing, 1243px with cards) -> tokens.css .orbit-main-scroll{position:relative}; after fix docScrollable=false.
- omowright note: page.goto and page.screenshot re-pin the 1440x900 agent viewport, so phone captures use Playwright (script $RUN_TMP/qa-shots.mjs).

## C1 PASS + C2 (behaviour + visual) PASS 2026-11-10T11:35:58.517Z
- Scenario: seeded Orion 7821 (--seed --app-source repo) + Vite 5193; Playwright script $RUN_TMP/qa-shots.mjs; results $RUN_TMP/shots/final/results.json; 20 PNGs $RUN_TMP/shots/final/{home,herd,cow,calendar,cameras}-{1440,390}-{light,dark}.png (looked at home-390-light, herd-390-dark, cow-390-light, calendar-1440-dark + omowright home-1440 light/dark).
- All 4 combos: 3 Home cards visible; herd card "28" + "3 need a look"; calendar card "Next: Calving due, Ruby DK-1013, tomorrow"; cameras card "2 of 3 online"; card frame src carries theme+lang; click -> /pages/herd, "28 animals"; attention filter = [Poppy,Rosa,Ruby]; search bella = 1; cow panel Bella DK-1001 "33.7 kg/day (7-day avg)"; calendar upcoming starts Luna check, Ruby calving, Ivy dry-off ... Saga; camera wall 3 tiles (2 online, 1 offline); docScrollable false, overflowX false.
- Console: only (a) my own QA init script touching localStorage inside sandboxed frames (script artifact, not product) and (b) 503 for frame.jpeg (no relay on this machine; expected, tiles degrade).
- seed install proven: $RUN_TMP/qa-seed/workspace/pages = calendar, cameras, herd; workspace git log "Example views added to the demo farm".

## C2 e2e PASS + C4 empty state PASS 2026-11-10T11:36:34.314Z
- cd packages/e2e && bunx playwright test -> "14 passed (17.2s)", rc=0, log $RUN_TMP/e2e.log: farm-views.spec.ts 4/4, plus cameras, chat x3, herd x2, home, local-ui, pages, minimal-first (fresh project).
- C4 empty farm: scaffolded herd view on unseeded Orion 7822 in sandbox harness: panel "0 animals / No animals yet ... Ask Orion to add your animals or connect a herd system", card "No animals recorded yet.", no page errors; shots $RUN_TMP/shots/final/empty-herd-{panel,card}.png. Children also captured calendar/cameras empty states.
- MISTAKE: killed bash_100 by a guessed id (it was the already-finished e2e monitor session, e2e.log complete with rc=0, no harm). Then killed the right one bash_96 (fresh Orion); 7822 listeners now 0; e2e ports 7718/7719/5183/5184 free.
## Learnings
- Never kill a session by a guessed id: read the id from the QA object / notepad first.
- omowright goto()/screenshot() re-pin 1440x900; use Playwright for phone captures.
- Absolutely positioned content inside an overflow scroller escapes it unless the scroller is positioned (found via scrollIntoView in QA).

## Child view-herd (st_01a1c521) completed 2026-11-10T11:41:04.703Z
- Files skills/farm-views/pages/herd/{page.json,config.json,herd.js,herd.test.ts,index.html,card.html}; 24 tests (17 herd + 7 repro); biome + draft-guard clean; ports 7831/7841 freed by child. Applied my steer: 'Last calving' shows only the date.
- Option ids match skills/farm-views/SKILL.md menus (filters, sorts, facts incl. days-in-milk, badges, sections).
- Index regenerated: INDEX_OK.
- QA Orion 7821 restarted on fresh data /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.ptu8EU7Y46/qa-seed2, bash=bash_148; previous bash_89 killed.

## FINAL RUN on finished files 2026-11-10T11:42:04.095Z — logs $RUN_TMP/final/
- typecheck rc=0; test rc=0 (0 '(fail)' lines); index --check rc=0; lint rc=1 = ONLY the 5 pre-existing core/voice-demo/*.json files (identical to baseline; none of mine).
- e2e: 14 passed (17.0s) rc=0 ($RUN_TMP/final/e2e.log), incl. farm-views.spec.ts 4/4.
- Capture matrix re-run on fresh seed (qa-seed2): all 4 combos pass the same assertions; 20 PNGs + results.json in $RUN_TMP/shots/final/.
- Self-review finding fixed after that run: /fonts/constructor|__proto__|toString returned 500 (object prototype lookup) -> Object.hasOwn guard in app.ts + assertion in orion.test.ts; delta rerun: orion typecheck 0, orion.test.ts 20 pass, biome clean.
- docs/TESTING.md: added farm-views.spec.ts row.

## Teardown receipts 2026-11-10T11:43:06.992Z
- Killed QA Orion bash_148 (7821) and Vite bash_76 (5193); earlier: bash_75, bash_89, bash_96. Listeners on 7821/7822/5193/7718/7719/5183/5184/783x-785x: 0.
- Browsers: every omowright run closed in finally with its profile removed; Playwright scripts close the browser in finally.

## Commits 2026-11-10T11:44:30.434Z (index-only staging; working tree untouched)
- d795070 Let a custom page show a card on Home and share Orbit's look
- ca319c0 Give the demo farm lactation and reproduction records, and let Orion record animal events
- dda3b30 Add the farm-views skill: tested herd, calendar and camera views Orion copies and tunes
- Left uncommitted on purpose (they sit inside the other session's uncommitted hunks): the <PageCards> line in the minimal-home branch of HomePage.tsx and the farm-views sentence in building-features/SKILL.md.
- Method: for the 11 shared files, O = working tree minus my edits; staged content = merge-file(state_k, O, original HEAD 6a927e3); HomePage and TESTING.md edited directly on HEAD text.
- Standalone verification worktree: $RUN_TMP/verify (remove at teardown with git worktree remove).

## Self-review (no reviewer gate: bare ulw run, no plan file, no review demanded) 2026-11-10T11:44:49.147Z
- Re-read my diff per file while building the commits; diagnostics: typecheck 0, biome clean on every file I touched, tests green, e2e 14/14.
- Defects found by self-review/QA and fixed in this run: /fonts/<prototype key> 500 -> 404 (+test); document scroll behind shell (+ verified docScrollable=false); !important lint error in kit.css; .orbit-btn defeating [hidden] (kit rule); days-in-milk shown twice in the animal panel; repro rules failing when a farm has events but no status fields (+test).
- Criteria: C1 PASS (results.json + 8 Home shots, 4 combos), C2 PASS (e2e 14/14 incl. farm-views 4/4 + shots), C3 PASS (c3-c4.json transcript + curl 200 + herd.test.ts resolveConfig tests), C4 PASS (401/404 curl, conflict keeps config.json byte-identical, escaping card not listed: orion.test.ts 'a page lists its card only when the card file is inside its own folder', empty state shots), C5 PASS with stated pre-existing lint failure (5 core/voice-demo JSON files, identical to baseline).
- Tier HEAVY held: new abstraction (page cards), protocol contract change, CORS on page serving, new agent tools, seed data.
- Deviation noted: standalone worktree install used 'bun install --frozen-lockfile' inside the temporary worktree (not scripts/locked-install.sh, which locks the main checkout); the main checkout's node_modules was never touched.
- Known limits to report: camera wall = still pictures, no live video; built-in Herd/Cameras modules remain so the seeded nav lists both; views are English (Orion translates when tuning); visual-qa's dual-reviewer step was not run (no review gate), I ran its capture matrix and looked at the captures myself; commits not pushed (catalog skill is fetchable from GitHub only after push; push triggers core-deploy per memory).
- Browser teardown receipt: headless shell processes = 0, leftover omowright profiles in RUN_TMP = 0.

## Standalone commit verification 2026-11-10T11:45:53.580Z — logs copied to .omo/evidence/farm-views/standalone/
- d795070: typecheck 0, test 0, lint 0, index 0. ca319c0: typecheck 0, test 0, lint 0, index 0. dda3b30: typecheck 0, test 0, index 0, lint 1 (docs/TESTING.md table formatting against HEAD's table) -> amended with biome-formatted file -> 318a3ca: lint 0 ("Checked 334 files. No fixes applied."), index 0 (code identical to dda3b30, only the md table changed).
- Final commits: d795070, ca319c0, 318a3ca. Not pushed.
## Final teardown
- Evidence copied to /Users/kristianvastveit/projects/orbit/.omo/evidence/farm-views (shots, results.json, c3-c4.json, logs, this notepad). RUN_TMP and the verification worktree removed (receipt below).
- Receipt: RUN_TMP removed | orphan notepad removed | removed empty orphan /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T//tmp.Z97kKtcdqB | 0
## Now
Final report.

## Completion audit 2026-11-10T11:46:54.253Z
- 4th commit 63c3446 "Tell Orion to start herd, calendar and camera screens from the catalog" (resources/AGENTS.md line appended on HEAD's text; biome clean; resources.test.ts 2 pass). Final commits: d795070, ca319c0, 318a3ca, 63c3446 (main is ahead of origin, not pushed).
- D6 grep over skills/farm-views: vendor/country hits: 0 | litre hits: 2 | emoji hits: 0 | second-wearable copy: 0 | external requests: 0
- D1-D6 and C1-C5 mapped to evidence above; evidence folder /Users/kristianvastveit/projects/orbit/.omo/evidence/farm-views.
