# AGENTS.md: Coding Agent Guide for Liv

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing shared contracts or cross-package wiring.

## Package map

All workspaces use `"type": "module"`, `"license": "AGPL-3.0-only"`, and source-first exports (`"exports": { ".": "./src/index.ts" }`), so no build step is needed between workspace packages.

| Package           | Path                                         | Responsibility                                                                                                                                                      |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@liv/protocol`   | [`packages/protocol`](packages/protocol)     | WebSocket JSON frames, TypeBox schemas (`feedback.ts`, `account.ts`, `billing.ts`), `Value.Check` codec, `LivClient`                                                |
| `@liv/schema`     | [`packages/schema`](packages/schema)         | Drizzle SQLite + PG tables, HLC (`src/hlc.ts`), wearable rule (`src/wearable.ts`), ICAR ADE (`src/ade.ts`), migrations, seed                                        |
| `@liv/agent`      | [`packages/liv`](packages/liv)               | Bun sidecar: protocol server, Pi SDK sessions, tools, feedback/sharing, undo snapshots (`isomorphic-git`), SQLite writer                                            |
| `@liv/connectors` | [`packages/connectors`](packages/connectors) | Connector SDK (`defineConnector`), CSV/XML/tabular parsers, starter template, and built-in generic CSV adapter                                                      |
| `@liv/sync`       | [`packages/sync`](packages/sync)             | Outbox pusher (`POST /v1/changes`) + ElectricSQL shape consumer (`GET /v1/shape`) with LWW-by-HLC                                                                   |
| `@liv/app`        | [`apps/liv`](apps/liv)                       | Tauri 2 shell (`src-tauri`) + React/TS/Vite UI + design system ([DESIGN.md](apps/liv/DESIGN.md))                                                                    |
| `@core/api`       | [`core/api`](core/api)                       | Hono cloud API (`/v1/changes`, `/v1/shape`, `/v1/llm/*`, `/v1/voice/*`, `/v1/auth/*`, `/v1/billing/*`, `/v1/feedback`, `/v1/submissions`, `/admin`) + PG migrations |
| `@liv/e2e`        | `packages/e2e`                               | Playwright e2e suite against the Vite web build and live Liv sidecar                                                                                                |
| Liv Android       | [`apps/android`](apps/android)               | Native Kotlin/Compose phone app (Gradle, not a Bun workspace): Liv by voice and text through Core's relay, push, widget, farm pages                                 |

## Commands

- **Install dependencies (SERIALIZED):** Always run [`scripts/locked-install.sh`](scripts/locked-install.sh), never `bun install` or `bun add` directly.
  - Plain link/install: `scripts/locked-install.sh`
  - Add dep to a package: `scripts/locked-install.sh packages/liv <pkg>`
  - Internal deps: add `"@liv/schema": "workspace:*"` to `package.json`, then run `scripts/locked-install.sh`.
- **Lint / Format:** `bun run lint` (`biome check .`) or `bun run lint:fix`
- **Typecheck all:** `bun run typecheck` (or per package: `bun run --filter '@liv/schema' typecheck`)
- **Test all:** `bun run test` (or per package: `bun run --filter '@liv/agent' test`)
- **Dev servers:** `bun run --filter '@liv/agent' dev` (`127.0.0.1:7717`, token `dev`) and `bun run --filter '@liv/app' dev`
- **Schema migrations:** `cd packages/schema && bun run generate` (runs `drizzle-kit` for SQLite + PG and embeds SQLite SQL into `src/migrations.gen.ts`).
- **Android app:** `cd apps/android && ./gradlew :app:assembleDebug :app:testDebugUnitTest` (JDK 17 and Android SDK 36; Firebase values go in the git-ignored `local.properties`, see [apps/android/README.md](apps/android/README.md)).
- **Skills catalog index:** `bun run skills:index` (regenerates `skills/index.json`; `bun run skills:index --check` verifies it).

## Contracts & data flow

- **Single local writer:** `@liv/agent` owns `liv.sqlite`. `@liv/app` never opens SQLite directly; it calls named `db.query` and `db.mutate` operations over `@liv/protocol`. No raw SQL crosses the WebSocket.
- **Synced vs local tables (`@liv/schema`):**
  - Synced (SQLite + PG parity): `farms`, `animals`, `devices`, `device_bindings`, `connectors`, `observations`, `cameras`, `camera_layouts`. Every synced row carries `farm_id`, `created_at`, `updated_at`, `deleted_at` (soft delete only), `hlc`, and `origin_device`.
  - Local-only (SQLite): `outbox`, `snapshots` (undo log for DB + `isomorphic-git` workspace commits), `sync_state`.
- **Feedback & shared builds:** Liv relays `feedback.send` (`POST /v1/feedback`, works signed out) and `shared.list` / `share_build` / `share_status` (`POST` & `GET /v1/submissions`, requires sign-in, refuses files matching secret patterns; reviewed via `/v1/admin/*` and `/admin` using `CORE_ADMIN_TOKEN`).
- **What Liv is told:** Her instructions are markdown in `packages/liv/resources/prompt/` (map: [`packages/liv/resources/README.md`](packages/liv/resources/README.md)), assembled by `packages/liv/src/agent/prompt.ts`; the voice prompt is `core/api/src/liv-voice-prompt.md`. `bun run liv:context` prints what a new conversation gets, and a running Liv writes it to `<data-dir>/liv-context.md`.
- **Voice:** The app runs the ElevenLabs client SDK against Liv's own socket (`/voice/<token>/<voiceId>` from `voice.start`); Liv relays it to Core's `/v1/voice/agent` and no key reaches the app. Finished turns and tool calls go through `voice.turn` / `voice.tool` and are saved in the conversation like chat. The agent's prompt and its five client tools live in `core/api/src/liv-voice-agent.ts` and must stay in step with `packages/protocol/src/voice.ts` and the `app` tool in `apps/liv/src/features/guide`.
- **Phone:** Liv dials out to Core's `/v1/relay/host` only while signed in with phone access on (`Settings.phoneAccess`, default off); the Android app connects to `/v1/relay/client` with the same account. A relayed socket is marked remote and may only use the request types in `remoteRequestAllowed` (`packages/liv/src/services/phone-relay.ts`); add a request there only when a phone may safely make it. Push goes through `/v1/push/*` and FCM (`FCM_PROJECT_ID`). See "Liv on the phone" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Protocol handshake:** First frame on `ws://127.0.0.1:<port>/ws` must be `hello { token, protocolVersion: 1 }`. Bad token closes with `4401` (terminal, do not reconnect).

## Hard invariants

1. **One-wearable domain rule:** An animal wears a collar OR a bolus OR an ear tag sensor (`WEARABLE_KINDS`), never several at once. At most ONE active wearable binding per animal (`wearable = 1 AND unbound_at IS NULL AND deleted_at IS NULL`). Enforced by `device_bindings_one_active_wearable_per_animal`, `assertSingleWearable()`, and `findWearableConflict()`. Never write copy or code that stacks multiple wearables on the same animal.
2. **Species & neutral copy:** Liv supports cattle (dairy and beef) and horses. Keep all product copy globally neutral (no country-specific defaults or assumptions).
3. **Never commit secrets:** Never commit API keys, `.env` files, or credentials. At runtime, LLM keys, connector secrets, and camera passwords go to the OS keychain (or `pi/auth.json` / encrypted store); SQLite and Postgres store only reference IDs (`credential_ref` / `credentialRef`).
