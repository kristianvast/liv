# Minimal-first modules contract (as implemented)

## DEVIATION from the fixed contract (read first)
Request params use **`moduleId`**, not `id`. Request frames are flat (`{ id, type, ...params }`), so
a `params.id` gets overwritten by the request id and the request can never be valid.
- `client.request("modules.enable", { moduleId: "herd" })`
- `client.request("modules.disable", { moduleId: "herd" })`
`OrbitModule.id` and the agent tool's `id` param keep the name `id`.

## @orbit/protocol (packages/protocol/src/messages.ts, re-exported from the package index)
- `MODULE_IDS = ["herd", "devices", "cameras"] as const`
- `ModuleId` (schema + type), `ModuleEnabledBy` ("orion" | "user" | "auto" | null)
- `OrbitModule = { id: ModuleId, enabled: boolean, enabledAt: string | null, enabledBy: ModuleEnabledBy }`
- `ModulesState = { modules: OrbitModule[] }`, always all three ids, in MODULE_IDS order
- Requests: `"modules.list"` {} -> ModulesState; `"modules.enable"` { moduleId } -> ModulesState
  (enabledBy "user"); `"modules.disable"` { moduleId } -> ModulesState (enabled false, enabledAt/By null)
- Event: `"modules.updated"`, body ModulesState. It is sent only when something actually changes
  (enabling a module that is already on, or disabling one that is already off, sends nothing).

## How the UI should subscribe
```ts
const state = await client.request("modules.list", {});        // after ready()
const off = client.on("modules.updated", (e) => setModules(e.modules));
// every reconnect: call modules.list again (events missed while disconnected are not replayed)
```
Turn on `herd` to show Herd, `devices` for Devices, and `cameras` for Cameras. Home, Chat, Settings and
"Your pages" are always visible and are not modules. The enable/disable response already holds the
new state; the event goes to every connected client, including the one that made the request.

## @orion/agent
- `packages/orion/src/services/modules.ts`: `ModulesStore`, `MODULES_FILE` ("modules.json"),
  `MODULE_TABLES` (herd->animals, devices->devices, cameras->cameras), `liveRowsIn(db)`,
  `describeModules(state)`, `isModuleId(v)`.
- Saved state: `<data-dir>/modules.json` (same shape as ModulesState). When the file is missing, each
  module starts on (enabledBy "auto") if its table has a live row (`deleted_at IS NULL`), else off.
- Auto-enable: local repo writes and remote sync changes (db.changed) on animals/devices/cameras
  switch the module on with enabledBy "auto" once a live row exists. They only switch modules on,
  never off. Note: a module the farmer turned off comes back on at the next write to its table if
  rows exist.
- Wiring: `packages/orion/src/app.ts` (request dispatch + the `dbChanged` hook).
- Agent tool `orbit_modules` (`packages/orion/src/agent/tools.ts`, also in `FARM_TOOL_NAMES`):
  params `{ action: "list" | "enable" | "disable", id?: ModuleId }`; enabling sets enabledBy "orion".
  Result text: `Enabled the herd module.` then `Orbit modules:` with one `- <id>: on (...)|off` line each.
- The system prompt (`packages/orion/src/agent/hub.ts`) now has a minimal-first paragraph.

## Mock model (--mock-model, for e2e)
A prompt containing the word `herd` plus `track`, `add` or `set up` (any order, any case) calls
`orbit_modules { action: "enable", id: "herd" }`, and the mock then replies with a short summary
that starts "Here is what I found:". The phrase to use: **"Help me track my herd"**.
Triggers that come earlier in the list still win (for example "make a page ..." and "list cows").
