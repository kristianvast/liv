# Ultrawork Notepad — multi-user farms (admin, invites, usage permission + caps, per-user tokens, own/farm switch, farm picker, per-user chats)
Started: 2026-11-12T15:10Z
RUN_TMP=/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/orbit-multiuser.6qeDkAdkwv

## Skills
- programming: TS work + tests (Orion lane, self). bun: spawning Orion/Core/vite for QA. browser: real-page QA of Settings. visual-qa: desktop+mobile captures of the new cards. git-master: commits (shared multi-session tree, use --only).

## Tier
HEAVY: DB migration (core 0009), billing/permission logic, session-auth routes. Gate not triggered (no ulw-plan, no review demand) -> self-review.

## Plan
Full plan + contracts: /Users/kristianvastveit/projects/orbit/.omo/plans/multi-user-farms.md
Order: protocol contract (me) -> spawn Core lane (deep-low) + App lane (visual-engineering) -> Orion lane (me) -> integrate, tests, live QA, browser QA, commits, leave app running.

## Success criteria + QA scenarios
See plan file criteria 1-5.

## Now
Protocol contract

## Todo
Protocol -> spawn lanes -> Orion -> integrate -> verify -> commit -> run for user -> cleanup

## Findings
- core/api/src/llm.ts handleLlm bills farm only; llm_usage has no user_id. entitlements.ts trial from first owner createdAt.
- core/api/src/billing.ts checkout without farm CREATES a farm ("X's farm") -> must become personal plan.
- core/api/src/app.ts farmAuth: user session w/o x-orbit-farm -> 400 except checkout.
- packages/orion/src/services/account.ts link() auto-claims local farm to cloud on sign-in (must stop, per user).
- packages/orion/src/db/repo.ts farm() = first farm; local DB single farm -> farm picker needs per-farm data dir + restart.
- packages/orion/src/agent/hub.ts sessions at dataDir/sessions with index.json (one list per install) -> per-user.
- main.ts: restart only with --parent-watch (shell restarts on clean exit).
- Memory pitfalls: commit with `git commit --only`, `git add -N` for new files; account.test uses .catch((e)=>e).

## Learnings

## Progress 15:40
- Protocol contract landed (account.ts, billing.ts); protocol typecheck + biome clean.
- Spawned core-lane st_01a1d051 (deep-low), app-lane st_01a1d052 (visual-engineering).
- Orion: farm-folders.ts (farms.json, farms/<id>/), repo.placeCloudFarm (HLC wall 0, no outbox), openDatabase installId opt, hub per-person chats (sessions/owner.json; people/<id>), account link() never creates cloud farms, createFarm (claim/adopt), openTarget, setUsageSource, updateMember patch, removeMember self = leave (no sign-out), gateway w/o farm, cloudConnection w/o farm; app.ts wiring + farms.open via config.reopen (main.ts: shell exit or in-process reopen; restart stays update-only).
- Orion tests (account.test.ts -t own chats|another farm|signed out|viewer|data folder|Google): 6 pass (Core-dependent tests pending Core lane).
## Now
Waiting for core-lane; running rest of orion suite.

## Evidence
- core-lane done: core/api bun test 316 pass; typecheck 0; biome clean (child report). Migration 0009_multi_user.sql. Note: the lane split accounts.ts into account-*.ts modules.
- Criteria 1+2 PASS (live HTTP, real createApp on fresh PGlite, fake upstream): /var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/orbit-multiuser.6qeDkAdkwv/qa-http-transcript.txt — /v1/me farms [] personal free; no-farm LLM 200 (account_id=user, farm_id null); checkout w/o farm -> 503 not_configured & farms count 0; invite useFarmPlan false -> accept 200 -> call billed account_id=member; PATCH useFarmPlan true -> next call account_id=farm; members usage farm 150/own 150; usageSource own -> personal; cap 150 -> 429 member_limit; owner restriction -> 409 owner_usage; DELETE member 204. Teardown: PORT_FREE | NO_PROC
- Orion account.test.ts: 11/12 pass incl. new usage-source test; the 1 fail "two Orions recover private chats" is the PARALLEL chat-sync session's WIP test (not mine).
- Gemini test fixed by adding farms.create (it relied on auto-claim, a behaviour the user asked to remove).

## Commits
- 166337d Core (index built = HEAD + my hunks; chat/farm-code hunks of the parallel session excluded). Standalone index export: core bun test 310 pass 0 fail, tsc 0, biome clean.
- 1e2fef2 Orion+protocol (rebuilt my exact edits on HEAD for account.ts/hub.ts/app.ts/account.test.ts; remaining worktree diff = parallel session's ChatSync/FarmCodeSync/history hunks). Standalone export: orion tsc 0, protocol tsc 0, app tsc ok, biome clean, orion bun test 159 pass 0 fail.
## Learnings
- Shared tree with a live parallel session editing the same files: git apply --unidiff-zero on a hunk subset misplaces hunks (caught by tsc on the exported index: app.ts TS1109). Fix: rebuild the file = HEAD + own edits (or bottom-up splice by HEAD line numbers) and write it with hash-object/update-index, then verify via git checkout-index into a temp dir with node_modules symlinks.
## Now
Waiting for app-lane st_01a1d052.

## Final
- Criterion 3 PASS on full tree: bun run typecheck all packages exit 0; bun run lint clean (504 files); core bun test 333/0; orion bun test 172/0; app test 89/89.
- Criterion 5 PASS (omowright owned headless Chrome, throwaway profile): screenshots qa-farm-picker-desktop.png, qa-members-desktop.png, qa-members-after-edit.png (switch off/on + limit 20000 -> Core row use_farm_plan true, limit 20000), qa-account-desktop.png, qa-own-plan-desktop.png (tab click -> Core usage_source own), qa-mobile-*.png (390x844), qa-ridge-open.png (farms.open Ridge -> farms.json active=Ridge, Orion reopened, topbar Ridge farm; back to Hill -> active null).
- Bug caught by browser QA: picker showed "Your farm" because the cloud had no farm name before first sync -> fixed in link() (36eb0bb), test asserts the name.
- Commits: 166337d Core, 1e2fef2 Orion+protocol, 36eb0bb Orion name fix, 9e781a4 Settings UI.
- Teardown: RUN_TMP removed; QA browser profile removed; no QA browser process. Left running for the user: Core harness :64530, Orion :64531, vite :64532 (data ~/.orbit-qa/multi-user).
