# Liv Roadmap

Liv v0.1.0 ships the local-first desktop app and cloud foundation:

- **Minimal-first desktop app (`@liv/app`):** Starts with Home, Ask Liv, and Settings; built-in Herd, Devices, and Cameras modules turn on when needed. Built and signed for Windows, macOS, and Linux with background auto-updates.
- **Liv sidecar (`@liv/agent`):** Local SQLite single writer (`@liv/schema` with ICAR ADE v1.5.1 mapping), undo snapshots for database rows and workspace files (via bundled `isomorphic-git`), custom pages and Home cards, local UI builds (`local_ui_build`), persistent farm/user memory, and OS-native `computer` use.
- **Skills and connectors (`skills/`, `@liv/connectors`):** On-demand skill catalog (`delaval-delpro` and `farm-views`), generic CSV import, and workspace connector scaffolding.
- **Core cloud, sync, billing, and feedback (`@liv/sync`, `@core/api`):** Accounts, farm roles and invites, ElectricSQL + HLC outbox sync, metered LLM and voice gateways (the ElevenLabs agent route the app uses, and the Gemini Live route kept for released clients), Stripe subscriptions and hardware checkout, in-app feedback (`POST /v1/feedback`), and reviewed farm-shared builds (`POST /v1/submissions`).

Here is what we are building next.

## 1. Connector hot reload and background scheduling

Today, Liv scaffolds connectors in `<data-dir>/workspace/connectors/<name>` and runs them on demand via `connector_run`. Next:

- Live hot reload when Liv edits a connector or workspace skill so the running sidecar picks up changes without restarting a session.
- Background scheduled sync loops inside Liv for enabled local connectors, with automatic deduplication on `(animal, device, kind, timestamp)`.

## 2. More vendor skills in the catalog

[`packages/connectors`](../packages/connectors) provides the connector SDK, CSV/XML/tabular parsers, and generic CSV adapter, while vendor-specific integrations live in the on-demand [`skills/`](../skills) catalog (starting with `delaval-delpro`). Next:

- Publish catalog skills verified against real farm exports and local LAN APIs for additional milking robots, collars, boluses, ear tag sensors, and scales.
- Automated conversion from approved farm-shared submissions (`/v1/admin/submissions`) into branch pull requests for `skills/`.

## 3. Agrointel vision models on a Jetson edge box

Liv discovers ONVIF cameras on the barn LAN (`camera_discover`), reads each camera's stream address from the camera itself, and streams them through the bundled `go2rtc` relay onto the barn map. Liv does not analyse the video yet. Next, we are connecting barn cameras to Agrointel computer-vision models:

- Local inference on an NVIDIA Jetson edge box on the farm LAN (or via Core for farms without an edge box).
- Continuous posture, gait, calving, and health observations for cattle and horses written into `observations` and surfaced in Liv and on Home.

## 4. Cloud that grows with the farms

Core runs as a separate production environment behind `api.agrointel.no`, on 1 to 10 instances with a backed-up database, and limits sign-ups and reset requests per network address. Next:

- Move the phone relay's registry out of one instance's memory, so the phone and the farm PC meet whichever instance each reaches.
- Reserve model and voice allowance before a call starts instead of checking it, so calls that start together cannot overspend.
- Retention for usage rows, sessions and rate events, and request limits per session on the model gateway.
