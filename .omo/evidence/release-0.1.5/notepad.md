# Ultrawork Notepad — Orbit 0.1.5: remove sensors, less text, Orion as builder + marketplace
Started: 2026-11-11T19:11:20.766Z
RUN_TMP=/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.XWS08uxSqo

## Skills
- refactor (user invoked): phases followed; codemap below. frontend: given to the app child. bun: read. git-master: read before committing. browser/visual-qa: QA via Playwright from packages/e2e (memory recipe).

## Tier
HEAVY - refactor crossing app and agent domains. No reviewer gate (no ulw-plan file, no review demand): self-review.

## Plan (exhaustively detailed)
1. Baseline typecheck/lint/test on HEAD 610dc46 (logs in RUN_TMP/base-*.log).
2. Fan out two children, disjoint write scopes:
   - app-ui (visual-engineering + frontend skill): apps/orbit/**, packages/e2e/web/**, apps/orbit/DESIGN.md.
   - orion-builder (deep-low): packages/orion/**, skills/**, README.md, docs/**.
   Kept by me: QA, version bump, commits, release.
3. Integrate: full typecheck/lint/test, skills index check.
4. QA C1/C2 with Playwright (seeded 7841/5197, unseeded 7842/5198), screenshots to .omo/evidence/release-0.1.5/.
5. Tear down, bump 0.1.5, commit per increment, push, tag v0.1.5, watch release workflow.
6. Start demo instance for the user.

## Decisions (mine, agent)
- module id `devices` stays (no protocol/schema change); its screen is "Connections" listing only existing connectors.
- Wearable data model and the one-wearable invariant stay in schema/Orion; only app UI for adding/attaching sensors goes. Existing wearable shown read-only.
- "Ring descriptions" = herd.orbit.ring.*Hint + devices satellites.subtitle; "most descriptions" = card subtitles, intros, hints in en+nb.

## Success criteria + QA scenarios
See registered goal (C1-C5).

## Now
Baseline running (bash_11)

## Todo
spawn children; integrate; QA; release; demo

## Findings
- HEAD 610dc46 on main == origin/main, clean tree (.omo/ untracked). Last tag v0.1.4; versions in apps/orbit/package.json, apps/orbit/src-tauri/tauri.conf.json, packages/orion/package.json.
- Sensor UI: apps/orbit/src/app/HomePage.tsx (satellite 371, gauge 424, telemetry 524), features/devices/index.tsx (AttachDeviceDialog 126, AddDeviceDialog 383, equipment panel 902-1226, connections panel 1227+), features/herd/index.tsx (AttachSensorDialog 831, buttons 2098/2143), design/OrbitRings.tsx defaults, locales en+nb.
- Orion: packages/orion/src/agent/hub.ts ORION_SYSTEM_PROMPT (84-101), tools.ts 381/393/646 "Sensors & Robots", resources/skills/{building-features,connectors,custom-pages,editing-orbit,herd-data,cameras}, resources/AGENTS.md.
- omo frontend skill: ~/.omo/binary-runtime/5.1.69/plugin/skills/frontend (SKILL.md 150 lines, ATTRIBUTION.md, Apache-2.0).
- Memory: this Mac may not reach GitHub (orbit-ci-native note) - check before release; harness SSL_CERT_FILE needs `env -u SSL_CERT_FILE -u SSL_CERT_DIR` for gh/curl.

## Learnings

- QA script: /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.XWS08uxSqo/qa.mjs <base> <label> <seeded|minimal> <outDir> (playwright from node_modules/.bun/@playwright+test@1.64.1/node_modules/@playwright/test/index.js). GitHub reachable (ls-remote ok with env -u SSL_CERT_FILE). Version bump touches 6 files: apps/orbit/package.json, src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}, packages/orion/package.json, packages/orion/src/app.ts. Tag push v* triggers Release workflow.
- Baseline: typecheck/lint/test all exit 0 on 610dc46.

- orion-builder child done; diff reviewed; package checks green (typecheck, 116 tests, skills 83, index --check, biome). share_build keeps its contract (pages/connectors/skills text only); other software is packaged as skills/<name>. Committed as Orion increment.
## Now
waiting on app-ui child (st_01a1cc06)

- app-ui child done (52 files, 241 keys removed per locale). QA sessions: {"checks":"bash_28","orionSeed":"bash_29","orionMin":"bash_30","viteSeed":"bash_31","viteMin":"bash_32"} ports 7841/7842/5197/5198, data dirs /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.XWS08uxSqo/d1,d2.
## Now
full checks + browser QA

- C3 PASS: typecheck/lint/test/skills:index --check exit 0 after bump (logs /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.XWS08uxSqo/*.log). C1 PASS 46 asserts, C2 PASS 49 asserts (.omo/evidence/release-0.1.5/*assertions.log, screenshots). Post-QA fix: disabled devices gate lost "Add it now" and reads "No connections yet" (rechecked: enable btn count 0). Herd drawer: attach btn 0, wearable read-only.
- FINDING (pre-existing, seed only): seeded "Herd register CSV" connector Sync now -> "connector code not found in imports/herd.csv".
- Teardown receipt: ports 7841/7842/5197/5198 no listeners, go2rtc 0, data dirs removed.
- Commits: 6ef5fb8 Orion, 1ed1ff8 App, a6f2626 Orbit 0.1.5. Pushed main; tag v0.1.5 pushed (ls-remote 3814e95).
- Demo: {"dd":"/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/orbit-demo.InHBVUDCpp","orion":"bash_5","vite":"bash_6"} http://127.0.0.1:5201/
## Now
confirm release workflow run
