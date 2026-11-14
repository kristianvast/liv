# Orion voice: shared contract for the Orion, voice UI and guide lanes

Three lanes build against this file at the same time in one working tree. The lead owns it.
If something here is wrong or missing, do not work around it silently: report it to the lead.

## 1. Design in one paragraph

Orion voice in the app uses the same stack as the website demo: an ElevenLabs agent (speech to
text, an LLM that does the thinking, text to speech, turn taking) driven by the official
`@elevenlabs/client` SDK with client tools. The SDK runs in the app in `connectionType:
"websocket"` mode and connects to a local Orion socket instead of ElevenLabs directly. Orion
relays that socket to Core (`/v1/voice/agent`, authenticated and metered), which relays it to
ElevenLabs. No key reaches the app. With `--mock-model`, Orion relays to a built-in mock agent
that speaks the same protocol, so the real SDK path is exercised in tests without the service.

## 2. App protocol (already written: packages/protocol/src/voice.ts, model.ts)

Requests:
- `voice.start { sessionId }` -> `{ voiceId, path, variables }`. `path` is a WebSocket path on
  Orion's own HTTP origin (`/voice/<token>/<voiceId>`). `variables` holds `farm_name` and
  `conversation_recap` for the agent's prompt placeholders.
- `voice.stop { voiceId }` -> `{ accepted }`.
- `voice.turn { voiceId, role: "user" | "assistant", text }` -> `{ accepted }`. One finished
  spoken or typed turn. Orion saves it in the conversation and emits `message.start` +
  `message.end` with the item (`voice: true`).
- `voice.tool { voiceId, toolCallId, name, args }` -> `{ result, isError }` with `name` one of
  `db_query`, `db_mutate`, `browser`, `orion_task`. Orion emits `tool.start` and `tool.end` for
  the conversation and saves the tool row in history.

Events:
- `voice.note { sessionId, voiceId, text }`: something the agent must be told mid-call (a
  background job finished). The app forwards it with
  `conversation.sendUserMessage("[Orion update] " + text)` and does NOT save it as a turn.
- `browser.view { sessionId, url, title, image, width, height, highlight }`: the page in Orion's
  browser as a base64 JPEG plus an optional highlight box in picture pixels. `image: null` means
  the browser closed.
- Existing events the voice UI also uses: `message.start/end`, `tool.start/update/end`,
  `agent.settled`, `session.updated`, `error` (`budget_exceeded`, `plan_required`).

Removed: requests `voice.audio`, `voice.text`; events `voice.state`, `voice.audio`,
`voice.transcript`, `voice.tool`.

Errors from `voice.start` keep their codes: `unauthorized` (not signed in), `plan_required`,
`budget_exceeded`, `not_found` (unknown conversation). A call that runs out of allowance ends
with the socket closing with code 4402 and an `error` event with code `budget_exceeded`.

## 3. Agent wire protocol on the local socket (ElevenLabs agent protocol, JSON text frames)

Client to server:
- `{ "type": "conversation_initiation_client_data", "dynamic_variables": {...}, ... }`
- `{ "user_audio_chunk": "<base64 pcm16 16 kHz>" }`
- `{ "type": "user_message", "text": "..." }` (typed input)
- `{ "type": "client_tool_result", "tool_call_id": "...", "result": "...", "is_error": false }`
- `{ "type": "pong", "event_id": 1 }`, `{ "type": "contextual_update", "text": "..." }`,
  `{ "type": "user_activity" }`

Server to client:
- `{ "type": "conversation_initiation_metadata", "conversation_initiation_metadata_event":
  { "conversation_id": "...", "agent_output_audio_format": "pcm_16000",
  "user_input_audio_format": "pcm_16000" } }`
- `{ "type": "user_transcript", "user_transcription_event": { "user_transcript": "..." } }`
- `{ "type": "agent_response", "agent_response_event": { "agent_response": "...", "event_id": 1 } }`
- `{ "type": "agent_chat_response_part", "text_response_part": { "type": "start" | "delta" |
  "stop", "text": "...", "event_id": 1 } }` (live service only; streaming caption text)
- `{ "type": "audio", "audio_event": { "audio_base_64": "...", "event_id": 1 } }`
- `{ "type": "interruption", "interruption_event": { "event_id": 1 } }`
- `{ "type": "ping", "ping_event": { "event_id": 1, "ping_ms": 0 } }`
- `{ "type": "client_tool_call", "client_tool_call": { "tool_name": "...",
  "tool_call_id": "...", "parameters": {...} } }`

Orion never parses these frames on the live path. Only the mock agent reads them.

## 4. The five client tools

| Tool | Runs in | Parameters |
|---|---|---|
| `db_query` | Orion (`voice.tool`) | `{ query, params }`, same named queries as `db.query` |
| `db_mutate` | Orion (`voice.tool`) | `{ mutation, params }`, same named mutations as `db.mutate` |
| `browser` | Orion (`voice.tool`) | `{ action, url?, ref?, text?, submit?, key?, amount?, note? }` with the text agent's browser actions plus `highlight` |
| `orion_task` | Orion (`voice.tool`) | `{ request }`. Hands a bigger job to the full Orion agent in the same conversation. Answers "started" at once; the outcome arrives as `voice.note` |
| `app` | the app itself (guide lane) | `{ action: "look" \| "highlight" \| "click" \| "go" \| "clear", ref?, path?, note? }` |

`voice.tool` answers within 12 seconds (the agent's own tool timeout could not be confirmed
from the ElevenLabs docs, so the budget is kept well under the 20 seconds the demo agent uses).
Slower work answers "Still working on it. I will
tell you when it is ready." and its outcome follows as `tool.end` plus `voice.note`.

### Result text of the `app` tool (the mock agent parses it, so the shape is fixed)

```
Screen: <page heading or title> (<path>)
<visible text of the main area, at most 1500 characters>
Things on screen:
[1] link "Home"
[2] link "Ask Orion"
[7] button "Delete" (ask the farmer to press this one)
```

- `look` returns exactly that. `highlight`, `click`, `go` and `clear` return a first line
  `Done: <what happened>` followed by the same listing of the screen after the action.
- A failure returns `Not done: <reason>` and is reported with `is_error: true`.
- Refs are numbers assigned by the last listing. A ref that no longer exists is `Not done`.
- Buttons that destroy or sign out (danger buttons) are listed with the suffix shown above and
  are highlight only: `click` on them is refused with `Not done: ...`.

## 5. Mock agent (Orion, `--mock-model`), deterministic, no audio

- After the first client frame it sends `conversation_initiation_metadata`
  (`conversation_id` = `mock-<uuid>`), then `agent_response` "Hello, Orion here. How can I help?".
- It never sends `audio`, `ping` or `user_transcript`. It ignores `user_audio_chunk`,
  `contextual_update`, `pong`, `user_activity`.
- On `user_message` with text T, first match wins:
  1. T starts with `[Orion update]`: `agent_response` = "Good news. " + the rest.
  2. `/\bopen settings\b/i`: tool `app {action:"look"}`, then `app {action:"click", ref}` where
     ref is taken from the first listing line matching `/^\[(\d+)\] .*settings/im`, then
     `agent_response` "I opened Settings for you." (no match: "I could not find Settings on
     this screen.")
  3. `/settings/i`: `app look`, then `app {action:"highlight", ref, note:"Settings are here."}`,
     then "Settings are in the menu. I marked it for you."
  4. T contains `https?://\S+`: `browser {action:"open", url}`, then
     `browser {action:"highlight", ref:1, note:"Start here."}`, then "I opened the page and
     marked where to start."
  5. `/\b(build|make|create)\b/i`: `orion_task {request:T}`, then "I have started on that. I
     will tell you when it is ready."
  6. otherwise: `db_query {query:"animals.list", params:{}}`, then "There are N animals in your
     herd. I checked the records on this computer." with N = `total` of the JSON result (on an
     error result: "I could not read the herd records.").
- Tool calls use ids `mock-1`, `mock-2`, ... and each waits for its `client_tool_result`.

## 6. Who owns what

- Orion lane: `packages/orion/**`, `docs/ARCHITECTURE.md` (the "## Voice agent" section and the
  request list line), nothing else.
- Voice UI lane: `apps/orbit/src/features/voice/**`, `apps/orbit/src/features/chat/**`,
  `apps/orbit/src/app/**`, `apps/orbit/src/i18n/locales/*/{voice,chat,home}.ts`,
  `apps/orbit/package.json` (the SDK dependency), `apps/orbit/public/**`,
  `apps/orbit/src-tauri/tauri.conf.json` only if unavoidable. (Not `packages/e2e/**`: the lead
  took that over and wrote `packages/e2e/web/voice.spec.ts`.)
- Guide lane: `apps/orbit/src/features/guide/**`, `apps/orbit/src/i18n/locales/*/guide.ts`.
- Shared one-line edits: `apps/orbit/src/i18n/catalogs.ts` (each UI lane registers its own
  namespace; re-read the file right before editing it).
- Lead: `packages/protocol/**`, `core/**`, `packages/e2e/**`, this file, commits. Nobody else
  commits.

## 7. Seam between the two UI lanes (exact exports of `apps/orbit/src/features/guide/index.ts`)

```ts
export type AppAction =
  | { action: "look" }
  | { action: "highlight"; ref: number; note?: string }
  | { action: "click"; ref: number; note?: string }
  | { action: "go"; path: string; note?: string }
  | { action: "clear" };
export interface AppActionResult { result: string; isError: boolean }

/** Runs one action against the app's own screen and resolves with the section 4 result text. */
export function runAppAction(action: AppAction): Promise<AppActionResult>;
/** Parses the agent's raw parameters; a malformed call resolves to a `Not done:` result instead. */
export function parseAppAction(parameters: unknown): AppAction | null;
/** Mounted once in the app shell, inside the router. Draws the highlight, pointer and note. */
export function GuideOverlay(): JSX.Element | null;
/** Shows the latest `browser.view` for a conversation, with its highlight box. Renders nothing until a page is open. */
export function BrowserView(props: { sessionId: string | null }): JSX.Element | null;
```

Stable test ids: `guide-highlight`, `guide-pointer`, `guide-note`, `browser-view`,
`browser-view-frame`, `browser-highlight`, `voice-stage`, `voice-orb`, `home-orion-widget`,
`home-voice-start`, `voice-dock`, `activity-row` (with `data-status` = running | done | error |
stopped), `voice-text-input`, `voice-end`, `chat-voice-button`.
State attribute on the widget, stage and dock roots: `data-voice-state` = idle | connecting |
listening | speaking | working | ended.
