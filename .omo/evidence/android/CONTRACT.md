# Orbit on the phone: cross-lane contract (2026-11-13)

Three lanes build against this file. It fixes only what crosses a lane boundary; each lane
settles its internals from the code it owns. If a lane finds this contract wrong or impossible,
it stops and reports `BLOCKED: <reason>` instead of inventing a different wire shape.

User decisions: the phone reaches Orion through Core; the app is native Kotlin; notifications are
Firebase push; a locked phone always unlocks first.

Lanes and write scopes (disjoint, shared checkout, nobody commits):

| Lane | Owns (may write) |
| ---- | ---------------- |
| A Core | `core/api/**` |
| B Orion | `packages/orion/**`, `packages/protocol/**`, `apps/orbit/src/**` (Settings switch + i18n only), `packages/e2e/**` only if a spec breaks |
| C Android | `apps/android/**`, root `.gitignore` (Android entries only) |

Docs (`docs/**`, `AGENTS.md`, `README.md`) belong to the orchestrator.

## 1. Relay in Core (lane A serves, lane B dials in, lane C connects)

All three sockets are WebSocket text frames. Auth is the existing user session:
`Authorization: Bearer orb_s_...` plus `x-orbit-farm: <farm uuid>` (required on every relay route).

### 1.1 `GET /v1/relay/host` (Orion on the PC)

- No or bad session: 401 `{error:{code:"unauthorized"}}`. Not a member of the farm: 403
  `{error:{code:"forbidden"}}`. Bad farm header: 400. No upgrade header: 426.
- Registered in memory under the key `<userId>:<farmId>`. A second host for the same key replaces
  the first; the old socket is closed with code 4409 (`replaced`).
- v1 rule: a phone reaches only a PC signed in to the SAME account (same `userId`) on the same farm.

### 1.2 `GET /v1/relay/client` (the phone)

- Same 401 / 403 / 400 / 426 answers as the host route.
- Query `channel=protocol` (default) or `channel=voice&voiceId=<id>`. Anything else: 400.
- No host registered for `<userId>:<farmId>`: HTTP 409 `{error:{code:"pc_offline"}}` before upgrade.
  (Phone access switched off on the PC looks the same, because Orion then never dials in.)
- At most 8 open client channels per host; the ninth gets 429 `{error:{code:"too_many"}}`.
- After upgrade Core assigns a channel id and pipes frames, see 1.4.
- If the host socket goes away, every client channel of that host is closed with code 4410
  (`pc_offline`). When the host closes one channel with a code in 4000-4999, Core closes that
  client with the same code and reason; any other code becomes 4410.

### 1.3 `GET /v1/relay/status`

Plain HTTP, same auth. Answers 200 `{online: boolean}`.

### 1.4 Envelopes between Core and the host socket

One JSON object per text frame:

- Core to host: `{"t":"open","ch":"<uuid>","channel":"protocol"}` or
  `{"t":"open","ch":"<uuid>","channel":"voice","voiceId":"<id>"}`
- Both ways: `{"t":"data","ch":"<uuid>","d":"<the client's or Orion's text frame, verbatim>"}`
- Both ways: `{"t":"close","ch":"<uuid>","code":<int, optional>,"reason":"<optional>"}`

A frame for an unknown `ch` is ignored. Frames over 8 MiB close that channel with 4413 (amended
2026-11-13 from 1 MiB: a 4 MiB page file from `pages.read` is about 5.4 MiB as base64 JSON). The
server's own WebSocket message cap stays at 16 MiB, so a larger message is closed by the server
with the standard 1009. Binary frames are not relayed (close 4415). The client side never sees an envelope: it sends and receives
the inner frames only.

Deploy note for the orchestrator (not lane work): the registry is in memory, so host and client
must land on the same Core instance.

## 2. Orion side (lane B)

### 2.1 Phone access switch

- `StoredSettings.phoneAccess: boolean`, default `false`; exposed in protocol `Settings` and
  `settings.update { phoneAccess }`. Desktop Settings gets one switch, test id
  `settings-phone-access`, icon first, short neutral copy in en and nb. It must fit the page it
  sits on without scrolling at 1280x820 and 1024x700.
- Orion dials `/v1/relay/host` only while: Core URL set, signed in, a linked cloud farm is open, and
  `phoneAccess` is true. It reconnects with backoff (1 s doubling to 30 s) and re-evaluates on
  account or setting changes. Core cuts sockets after 60 minutes; that is a normal reconnect.

### 2.2 Loopback tunnel

For each `open` envelope Orion opens a WebSocket to its own server and pipes `data` both ways:

- `channel: "protocol"`: the local protocol socket, marked remote by an in-process secret (for
  example `/ws?relay=<random made at start>`); the secret never leaves the process.
- `channel: "voice"`: the local `/voice/<token>/<voiceId>` socket, with Orion's own token.

When the loopback socket closes, Orion sends a `close` envelope with its code and reason; a `close`
envelope from Core closes the loopback socket.

### 2.3 What a remote protocol socket may do

- First frame is still `hello`: the phone sends `{"id":"1","type":"hello","token":"relay","protocolVersion":1}`.
  On a remote socket the token value is ignored (Core and the in-process secret already
  authenticated it); the protocol version is still checked. `PROTOCOL_VERSION` stays 1.
- Allowed request types: `hello`, `sessions.*`, `chat.*`, `pages.list`, `pages.read`, `modules.list`,
  `settings.get`, `db.query`, `db.mutate`, `snapshots.list`, `snapshots.undo`, `voice.*`, and the
  read-only account status request if one exists.
- Everything else answers the normal error response with code `forbidden`. In particular:
  `settings.update`, `auth.*`, `access.respond`, `account.*` writes, `members.*`, `invites.*`,
  `billing.*`, `localUi.*`, `modules.enable|disable`, `farms.*`, `feedback.send`.
- Events are delivered to remote sockets like to local ones.
- `voice.start` on a remote socket returns the usual result; the phone ignores `path` and uses
  `voiceId` with `/v1/relay/client?channel=voice&voiceId=<voiceId>`.

### 2.4 New request `pages.read`

`{ type: "pages.read", pageId: string, path: string }` answers
`{ contentType: string, data: string /* base64 */, size: number }`.

(Amended 2026-11-13: the parameter is `pageId`, not `id`, because the flat protocol frame already
uses `id` for request correlation.)

- `pageId` is a page id from `pages.list`; `path` is a file inside that page folder (`""` or
  `"index.html"` for the page itself). Same path safety as the HTTP page route.
- Reserved page ids: `_orbit.css` (path `""`) returns the page kit stylesheet the HTTP route serves;
  `_fonts` with `path` = a font file name returns that font.
- Over 4 MiB: error code `too_large`. Missing: `not_found`.
- `_orbit.js` is NOT served this way: the Android app supplies its own `window.orbit`
  (`query`, `mutate`, `request`, `on`) that talks to the app's relay socket.

### 2.5 Orion tells Core to notify

`POST <core>/v1/push/notify` (section 3.3) when a chat run that was started from a remote socket
settles, or raises `access.request`, and no remote protocol socket is connected at that moment.
At most one notify per conversation per 30 seconds. A failed notify is logged, never thrown.

## 3. Push in Core (lane A serves, lane C registers, lane B notifies)

### 3.1 Devices

- Migration `core/api/migrations/0012_push_devices.sql` (0011 is the newest today; never renumber).
- `POST /v1/push/devices` (session, no farm header) body `{token: string, platform: "android", locale?: string}`
  answers 200 `{ok:true}`; upsert by token, the token moves to the caller.
- `DELETE /v1/push/devices` body `{token}` answers 200 `{ok:true}` (also when the token is unknown).

### 3.2 Sending

FCM HTTP v1: `POST https://fcm.googleapis.com/v1/projects/<projectId>/messages:send` with a Google
OAuth bearer token. `createApp` takes `push?: { projectId: string, accessToken: () => Promise<string>, fetch?: FetchLike }`;
production wires `FCM_PROJECT_ID` plus the existing Google token provider. No project id: device
routes still work and sends are skipped. An `UNREGISTERED` / 404 answer deletes that device row.

Message shape (the phone localizes through Android string resources):

```json
{"message":{"token":"<device token>",
  "android":{"priority":"HIGH","notification":{"channel_id":"alerts","title_loc_key":"push_calving_title","body_loc_key":"push_alert_body_named","body_loc_args":["Dagros"]}},
  "data":{"kind":"calving_alert","farmId":"<uuid>","observationId":"<uuid>","animalId":"<uuid or empty>"}}}
```

| kind | channel_id | title_loc_key | body |
| ---- | ---------- | ------------- | ---- |
| `calving_alert` | `alerts` | `push_calving_title` | `push_alert_body_named` + args `[animal name or tag]`, else `push_alert_body_unnamed` |
| `health_event` | `alerts` | `push_health_title` | same as above |
| `heat_alert` | `alerts` | `push_heat_title` | same as above |
| `orion_done` | `orion` | `push_orion_done_title` | plain `body` = the conversation title |
| `orion_needs_you` | `orion` | `push_orion_needs_title` | plain `body` = the conversation title |

`data` for the Orion kinds: `{"kind","farmId","sessionId"}`. All `data` values are strings.

### 3.3 Triggers

- Herd alerts: when `/v1/changes` applies an `observations` row whose kind is one of the alert kinds
  (`ALERT_KINDS` in `@orbit/schema`), that Core did not have before, that is not deleted and whose
  observation time is within the last 24 hours, Core pushes to every device of every member of
  that farm. Sending happens after the response and can never fail the request.
- `POST /v1/push/notify` (session + `x-orbit-farm`; a legacy farm token is refused with 403) body
  `{kind: "orion_done" | "orion_needs_you", sessionId: string, title: string}` answers 204 and pushes
  only to the caller's own devices.

## 4. Android app (lane C)

- `apps/android`, Gradle Kotlin DSL with a committed wrapper, Kotlin + Jetpack Compose,
  `applicationId` and namespace `no.agrointel.orbit`, minSdk 28, compile/target SDK 36, JDK 17.
- Core URL from Gradle property `orbit.coreUrl`; the debug default is `http://10.0.2.2:8797`
  (cleartext allowed in the debug build only).
- Firebase without the google-services plugin: `orbit.firebase.appId|apiKey|projectId|senderId` from
  `local.properties` (git-ignored) into `BuildConfig`, `FirebaseApp.initializeApp(context, options)`
  by hand; blank values switch push off without crashing.
- Sign in with email and password against Core (`/v1/auth/login`, `/v1/me`, `/v1/auth/logout`); the
  session is stored encrypted. Farm picker when the account has several farms.
- Relay client per sections 1.2, 2.3; "PC is off" state on 409 / 4410 with a retry.
- Unlock first: nothing in the app shows over the lock screen. An entry point used while the phone
  is locked asks the system to dismiss the keyguard and starts the call only after the unlock.
- Entry point for a call: action `no.agrointel.orbit.action.TALK`. The widget, the assistant
  gesture (`android.intent.action.ASSIST`) and the optional ongoing notification all use it.
- Widget: `android:widgetCategory="home_screen|keyguard"`.
- Notification channels `alerts` (high importance) and `orion` (default); string resources for every
  key in section 3.2, in `values` (en) and `values-nb`.
- Test ids: Compose `testTag`s exposed as resource ids (`testTagsAsResourceId`), so
  `uiautomator dump` shows them: `signin-email`, `signin-password`, `signin-submit`, `ask-input`,
  `ask-send`, `talk-start`, `call-end`, `call-state`, `nav-chats`, `nav-pages`, `nav-alerts`,
  `nav-account`, `pc-offline`, `page-webview`.

## 5. Local QA layout (orchestrator)

Core on PGlite at `127.0.0.1:8797`, Orion from source with `--mock-model` at `127.0.0.1:7797`
(token `qa`), emulator AVD `orbit_phone` reaching the host at `10.0.2.2`. Evidence goes to
`.omo/evidence/android/`.
