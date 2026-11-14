# Port LIV-app CameraPanel to Orbit (+ go2rtc relay, synced layout table)

User decisions (2026-11-05): scope = "Also add go2rtc relay" (panel UI + MSE player + relay; NO detection/heatmap/zones/weight); layout = "Synced farm table".
Tier: HEAVY (new synced table + migrations, new external integration go2rtc, process mgmt, credential handling).

## Contract (done by lead, packages/protocol)
- model.ts: CameraMapTile {i: cameraId, x, y, w, ar?}, CameraMapLayout {version: 2, tiles[]}
- db.ts queries: "cameras.relay" -> CameraRelayStatus {available, reason}; "cameraLayout.get" -> {layout|null}
- db.ts mutation: "cameraLayout.save" {layout}
- HTTP (Orion, token-gated like /app/<token>/): /camera/<token>/<cameraId>/ws (WS proxy to go2rtc /api/ws?src=<cameraId>), /camera/<token>/<cameraId>/frame.jpeg

## Lane A (deep-low, backend): schema + migrations + sync + core/api + orion relay + CI bundling
## Lane B (visual-engineering, apps/orbit): BarnMapCanvas/CameraTile/viewport/MSE stream port, restyled in Orbit tokens + i18n
## Lead: contract, integration, live QA (go2rtc binary download, browser at desktop+mobile), review gate
